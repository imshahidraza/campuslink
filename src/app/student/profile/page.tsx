import { requireStudentOrRedirect } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ProfileForm } from "@/components/dashboard/ProfileForm";
import { ResumeParser } from "@/components/dashboard/ResumeParser";
import { ResumeFeedback, type ResumeFeedbackData } from "@/components/dashboard/ResumeFeedback";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const { session, student } = await requireStudentOrRedirect();
  // Metadata only — never select the file bytes here.
  const resume = await prisma.resume.findUnique({
    where: { studentId: student.id },
    select: { fileName: true, size: true, uploadedAt: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">My Profile</h1>
      <p className="text-muted text-sm mt-1">
        Your academic record is verified by your placement cell. Career details below are yours to keep current.
      </p>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader className="flex flex-row items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <CardTitle>Academic record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Name" value={session.name} />
            <Row label="Roll No." value={student.rollNo} />
            <Row label="Program" value={student.program || "—"} />
            <Row label="Specialization" value={student.branch} />
            <Row label="CGPA" value={student.cgpa.toFixed(2)} />
            <Row label="Backlogs" value={String(student.backlogs)} />
            <Row label="Graduation Year" value={String(student.graduationYear)} />
            <Row label="Aptitude" value={student.aptitudeScore != null ? String(student.aptitudeScore) : "—"} />
            <Row label="Reasoning" value={student.reasoningScore != null ? String(student.reasoningScore) : "—"} />
            <Row label="Verbal" value={student.verbalScore != null ? String(student.verbalScore) : "—"} />
            <Row
              label="Communication"
              value={student.communicationScore != null ? String(student.communicationScore) : "—"}
            />
            <p className="text-xs text-muted pt-2">
              Spot an error? Ask your placement cell to correct it — this record is TPO-verified.
            </p>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Resume — AI import</CardTitle>
            </CardHeader>
            <CardContent>
              <ResumeParser
                saved={resume ? { studentId: student.id, fileName: resume.fileName, size: resume.size, uploadedAt: resume.uploadedAt.toISOString() } : null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resume feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <ResumeFeedback
                existing={(student.resumeFeedback as ResumeFeedbackData | null) ?? null}
                canReview={Boolean(student.resumeText && student.resumeText.trim().length >= 40)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Career profile</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm
                defaults={{
                  skills: student.skills,
                  certifications: student.certifications,
                  courses: student.courses,
                  preferredRoles: student.preferredRoles,
                  githubUrl: student.githubUrl,
                  linkedinUrl: student.linkedinUrl,
                  portfolioUrl: student.portfolioUrl,
                  projectsRaw: student.projects ? JSON.stringify(student.projects) : "",
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-soft pb-2 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  );
}
