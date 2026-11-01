import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { stageLabel } from "@/lib/utils";

/** The built-in PDF fonts only cover basic Latin, so anything else becomes "?" instead of crashing. */
function safe(text: string) {
  return text.replace(/[^\x20-\x7E -ÿ]/g, "?");
}

const FUNNEL: { label: string; stages: string[] }[] = [
  { label: "Applicants", stages: [] }, // everyone
  { label: "Shortlisted or further", stages: ["SHORTLISTED", "INTERVIEW", "SELECTED", "OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"] },
  { label: "Interview or further", stages: ["INTERVIEW", "SELECTED", "OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"] },
  { label: "Selected or further", stages: ["SELECTED", "OFFER_REQUESTED", "OFFER_SENT", "OFFER_ACCEPTED", "OFFER_DECLINED", "JOINED"] },
  { label: "Offer accepted", stages: ["OFFER_ACCEPTED", "JOINED"] },
  { label: "Joined", stages: ["JOINED"] },
  { label: "Not selected", stages: ["REJECTED"] },
];

/** One-page-or-more summary of a drive for the TPO to hand to college management. TPO only. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "TPO") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const drive = await prisma.drive.findUnique({
    where: { id },
    include: {
      applications: { include: { student: { include: { user: true } } }, orderBy: { fitScore: "desc" } },
    },
  });
  if (!drive) return NextResponse.json({ error: "Drive not found." }, { status: 404 });
  const college = await prisma.college.findFirst({ orderBy: { createdAt: "asc" } });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const ink = rgb(0.1, 0.07, 0.18);
  const muted = rgb(0.4, 0.38, 0.45);
  const brand = rgb(0.42, 0.2, 0.75);

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (t: string, x: number, size: number, f: PDFFont = font, color = ink) => {
    page.drawText(safe(t), { x, y, size, font: f, color });
  };
  const ensure = (space: number) => {
    if (y - space < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const fit = (t: string, size: number, f: PDFFont, maxW: number) => {
    let s = safe(t);
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
    return s === safe(t) ? s : s.slice(0, -1) + "...";
  };

  // Header
  text(college?.name ?? "C-Link", M, 10, bold, brand);
  y -= 22;
  text("Placement drive report", M, 20, bold);
  y -= 24;
  text(`${drive.jobRole} - ${drive.companyName}`, M, 13, bold);
  y -= 16;
  const meta = [
    `Status: ${stageLabel(drive.status)}`,
    drive.driveDate ? `Date: ${drive.driveDate.toISOString().slice(0, 10)}` : null,
    drive.venue ? `Venue: ${drive.venue}` : null,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
  ].filter(Boolean) as string[];
  text(meta.join("   |   "), M, 9, font, muted);
  y -= 14;
  const rules = [
    drive.minCgpa != null ? `Min CGPA ${drive.minCgpa}` : null,
    drive.maxBacklogs != null ? `Max backlogs ${drive.maxBacklogs}` : null,
    drive.eligibleBranches.length ? `Specializations: ${drive.eligibleBranches.join(", ")}` : null,
    drive.eligibleGradYears.length ? `Batch: ${drive.eligibleGradYears.join(", ")}` : null,
  ].filter(Boolean) as string[];
  text(fit(`Eligibility: ${rules.join("; ") || "open to all"}`, 9, font, W - 2 * M), M, 9, font, muted);
  y -= 26;

  // Funnel
  text("Hiring funnel", M, 12, bold);
  y -= 18;
  const apps = drive.applications;
  for (const row of FUNNEL) {
    const count = row.stages.length === 0 ? apps.length : apps.filter((a) => row.stages.includes(a.stage)).length;
    const barMax = 220;
    const pct = apps.length ? count / apps.length : 0;
    text(row.label, M, 10);
    page.drawRectangle({ x: M + 170, y: y - 2, width: barMax, height: 9, color: rgb(0.93, 0.91, 0.97) });
    if (pct > 0) page.drawRectangle({ x: M + 170, y: y - 2, width: Math.max(2, barMax * pct), height: 9, color: brand });
    text(String(count), M + 170 + barMax + 10, 10, bold);
    y -= 17;
  }
  y -= 14;

  // Candidates table
  text("Candidates", M, 12, bold);
  y -= 18;
  const cols = [
    { h: "Name", x: M, w: 150 },
    { h: "Roll no.", x: M + 155, w: 70 },
    { h: "Specialization", x: M + 230, w: 105 },
    { h: "CGPA", x: M + 340, w: 35 },
    { h: "Fit", x: M + 380, w: 28 },
    { h: "Stage", x: M + 413, w: 90 },
  ];
  const header = () => {
    page.drawRectangle({ x: M - 4, y: y - 5, width: W - 2 * M + 8, height: 17, color: rgb(0.93, 0.91, 0.97) });
    cols.forEach((c) => text(c.h, c.x, 9, bold));
    y -= 18;
  };
  header();
  for (const a of apps) {
    ensure(18);
    if (y > H - M - 1) header(); // fresh page → repeat header
    const cells = [
      a.student.user.name,
      a.student.rollNo,
      a.student.branch,
      a.student.cgpa.toFixed(2),
      a.fitScore != null ? String(a.fitScore) : "-",
      stageLabel(a.stage),
    ];
    cells.forEach((c, i) => text(fit(c, 9, font, cols[i].w), cols[i].x, 9));
    y -= 15;
  }
  if (apps.length === 0) text("No applicants yet.", M, 10, font, muted);

  y -= 20;
  ensure(30);
  text("AI fit scores are advisory; every shortlist and selection decision was made by a person.", M, 8, font, muted);

  const bytes = await pdf.save();
  const fileName = safe(`drive-report-${drive.companyName}-${drive.jobRole}`).replace(/[^\w-]+/g, "_").slice(0, 80);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
