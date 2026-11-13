import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { isSameOrigin } from "@/lib/origin";
import { parseWebUrl } from "@/lib/safeUrl";
import {
  MAX_KEY_PEOPLE,
  MAX_PHOTO_BYTES,
  MAX_ROLE_LENGTH,
  MAX_NAME_LENGTH,
  cleanText,
  sniffImage,
} from "@/lib/keyPeopleShared";

/**
 * A recruiter saves one of their (up to three) key people: role, name, profile link and an optional photo.
 * Only the recruiter themself can do this, and only for their own company.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "This request was blocked." }, { status: 403 });

  const session = await getSession();
  if (!session || session.role !== "RECRUITER") {
    return NextResponse.json({ error: "Only recruiters can edit their company's key people." }, { status: 403 });
  }

  const limit = checkRateLimit(`keypeople:${session.userId}:${clientKey(req)}`, 30, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many saves. Please wait a few minutes." }, { status: 429 });
  }

  // Reject oversized bodies before reading them into memory.
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_PHOTO_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That photo is too large. The limit is 2 MB." }, { status: 413 });
  }

  try {
    const recruiter = await prisma.recruiter.findUnique({ where: { userId: session.userId }, select: { id: true } });
    if (!recruiter) return NextResponse.json({ error: "Recruiter profile not found." }, { status: 404 });

    const form = await req.formData();
    const position = Number(form.get("position"));
    if (!Number.isInteger(position) || position < 0 || position >= MAX_KEY_PEOPLE) {
      return NextResponse.json({ error: `You can add up to ${MAX_KEY_PEOPLE} people.` }, { status: 400 });
    }

    const role = cleanText(form.get("role"), MAX_ROLE_LENGTH);
    const name = cleanText(form.get("name"), MAX_NAME_LENGTH);
    if (!role) return NextResponse.json({ error: "Please enter the role, for example CEO or HR Manager." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Please enter the person's name." }, { status: 400 });

    const link = parseWebUrl(form.get("profileUrl"), "profile link");
    if (!link.ok) return NextResponse.json({ error: link.message }, { status: 400 });

    // Photo: optional. Checked by its real bytes, and SVG (which can carry scripts) is never accepted.
    let photo: { mimeType: string; bytes: Uint8Array<ArrayBuffer> } | null = null;
    const file = form.get("photo");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: "That photo is too large. The limit is 2 MB." }, { status: 413 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mimeType = sniffImage(bytes);
      if (!mimeType) {
        return NextResponse.json({ error: "Please choose a JPG, PNG or WebP photo." }, { status: 400 });
      }
      photo = { mimeType, bytes };
    }
    const removePhoto = form.get("removePhoto") === "1";

    const saved = await prisma.$transaction(async (tx) => {
      const person = await tx.keyPerson.upsert({
        where: { recruiterId_position: { recruiterId: recruiter.id, position } },
        create: { recruiterId: recruiter.id, position, role, name, profileUrl: link.url },
        update: { role, name, profileUrl: link.url },
        select: { id: true },
      });
      if (photo) {
        await tx.keyPersonPhoto.upsert({
          where: { keyPersonId: person.id },
          create: { keyPersonId: person.id, mimeType: photo.mimeType, size: photo.bytes.length, data: photo.bytes },
          update: { mimeType: photo.mimeType, size: photo.bytes.length, data: photo.bytes, uploadedAt: new Date() },
        });
      } else if (removePhoto) {
        await tx.keyPersonPhoto.deleteMany({ where: { keyPersonId: person.id } });
      }
      return person;
    });

    return NextResponse.json({ ok: true, id: saved.id });
  } catch {
    return NextResponse.json({ error: "Couldn't save. Please try again." }, { status: 500 });
  }
}
