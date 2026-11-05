import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { stageLabel } from "@/lib/utils";
import Link from "next/link";
import { Users, Briefcase, Award, TrendingUp, GraduationCap, ArrowRight } from "lucide-react";

export default async function TpoOverview() {
  const [studentCount, openDrives, placedCount, recentDrives, specializationCount, college, pendingRecruiters, offersToReview, docsToVerify, datesToAnswer] = await Promise.all([
    prisma.student.count(),
    prisma.drive.count({ where: { status: "OPEN" } }),
    prisma.student.count({ where: { placementStatus: { in: ["OFFER_ACCEPTED", "JOINED"] } } }),
    prisma.drive.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { recruiter: true } }),
    prisma.specialization.count(),
    prisma.college.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.recruiter.count({ where: { status: "PENDING" } }),
    prisma.application.count({ where: { stage: "OFFER_REQUESTED" } }),
    prisma.application.count({ where: { stage: "OFFER_ACCEPTED", documentsVerified: false } }),
    prisma.scheduleRequest.count({ where: { status: "WAITING_TPO" } }),
  ]);
  const attention = [
    { n: pendingRecruiters, text: "recruiter waiting for approval", plural: "recruiters waiting for approval", href: "/tpo/recruiters" },
    { n: datesToAnswer, text: "interview date request to answer", plural: "interview date requests to answer", href: "/tpo/scheduling" },
    { n: offersToReview, text: "offer request to review", plural: "offer requests to review", href: "/tpo/offers" },
    { n: docsToVerify, text: "student whose documents need checking", plural: "students whose documents need checking", href: "/tpo/offers" },
  ].filter((a) => a.n > 0);

  const placementRate = studentCount > 0 ? ((placedCount / studentCount) * 100).toFixed(1) : "0.0";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{college?.name || "Placement Cell"} Overview</h1>
      <p className="text-muted text-sm mt-1">A single view across students, drives, and outcomes.</p>

      {specializationCount === 0 && (
        <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-100/50 px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-brand-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-ink">Set up your college&apos;s programs &amp; specializations</p>
              <p className="text-xs text-muted mt-0.5">
                No specializations are set up yet. Students can&apos;t be matched to drives until you add some.
              </p>
            </div>
          </div>
          <LinkButton href="/tpo/college-setup" size="sm" className="shrink-0">
            Set up now <ArrowRight className="h-3.5 w-3.5" />
          </LinkButton>
        </div>
      )}

      {attention.length > 0 && (
        <Card className="mt-6 border-accent-lime/60">
          <CardHeader>
            <CardTitle>Needs your attention</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-2">
            {attention.map((a) => (
              <Link key={a.href + a.text} href={a.href} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm text-ink hover:bg-surface-2">
                <span>
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-lime px-2 text-xs font-semibold text-brand-950 mr-2">{a.n}</span>
                  {a.n === 1 ? a.text : a.plural}
                </span>
                <ArrowRight className="h-4 w-4 text-muted" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-4 gap-5">
        <StatCard icon={Users} label="Total students" value={String(studentCount)} />
        <StatCard icon={Briefcase} label="Open drives" value={String(openDrives)} />
        <StatCard icon={Award} label="Placed" value={String(placedCount)} />
        <StatCard icon={TrendingUp} label="Placement rate" value={`${placementRate}%`} />
      </div>

      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent drives</CardTitle>
          <LinkButton href="/tpo/drives" variant="ghost" size="sm">
            View all
          </LinkButton>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentDrives.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 border-b border-border-soft last:border-0">
              <div>
                <p className="text-sm font-medium text-ink">{d.jobRole}</p>
                <p className="text-xs text-muted">{d.companyName}</p>
              </div>
              <Badge tone="brand">{stageLabel(d.status)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <Icon className="h-4 w-4 text-brand-500" />
        <p className="text-xl font-semibold text-ink mt-3">{value}</p>
        <p className="text-xs text-muted mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
