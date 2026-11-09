import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** A real PDF starts with "%PDF-". We check the bytes, never the file name or the browser's claimed type. */
function looksLikePdf(bytes: Uint8Array) {
  return bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/** Student uploads their resume PDF. We keep the file (so TPO/recruiters can view it) and return its text for AI parsing. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") {
    return NextResponse.json({ error: "Only students can upload a resume." }, { status: 403 });
  }

  const limit = checkRateLimit(`resume:${session.userId}:${clientKey(req)}`, 10, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many uploads. Please wait a few minutes." }, { status: 429 });
  }

  // Reject oversized bodies before reading them into memory.
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That file is too large. The limit is 5 MB." }, { status: 413 });
  }

  try {
    const student = await prisma.student.findUnique({ where: { userId: session.userId }, select: { id: true } });
    if (!student) return NextResponse.json({ error: "Student profile not found." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please choose a PDF file." }, { status: 400 });
    }
    if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large. The limit is 5 MB." }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikePdf(bytes)) {
      return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
    }

    // Extract text first; if the PDF is corrupt we reject it before storing anything.
    let text = "";
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const out = await extractText(pdf, { mergePages: true });
      text = (Array.isArray(out.text) ? out.text.join("\n") : out.text).trim();
    } catch {
      return NextResponse.json({ error: "We couldn't read that PDF. It may be damaged or password-protected." }, { status: 400 });
    }

    // Safe display name only — never trust a client-supplied path or odd characters.
    const fileName = (file.name || "resume.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 100);

    await prisma.resume.upsert({
      where: { studentId: student.id },
      create: { studentId: student.id, fileName, size: bytes.length, data: bytes },
      update: { fileName, size: bytes.length, data: bytes, uploadedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      fileName,
      text: text.slice(0, 20000),
      textFound: text.length >= 20,
    });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
