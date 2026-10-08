import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { readinessLabel, stageLabel } from "@/lib/utils";
import { Gauge, Briefcase, Bell, ArrowUpRight } from "lucide-react";

export default async function StudentOverview() {
  const { session, student: studentBase } = await requireStudentOrRedirect();
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentBase.id },
    include: {
      applications: { include: { drive: true }, orderBy: { createdAt: "desc" }, take: 5 },
      notifications: { where: { read: false }, orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  const openDrivesCount = await prisma.drive.count({ where: { status: "OPEN" } });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Welcome back, {session.name.split(" ")[0]}</h1>
      <p className="text-muted text-sm mt-1">Here&apos;s where your placement journey stands.</p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Readiness</CardTitle>
            <Gauge className="h-4 w-4 text-brand-500" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-ink">{readinessLabel(student.readinessLevel)}</p>
            <p className="text-xs text-muted mt-1">
              {student.readinessUpdatedAt
                ? `Updated ${new Date(student.readinessUpdatedAt).toLocaleDateString()}`
                : "Run your first analysis"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Open Drives</CardTitle>
            <Briefcase className="h-4 w-4 text-brand-500" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-ink">{openDrivesCount}</p>
            <p className="text-xs text-muted mt-1">Currently accepting applications</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Status</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-brand-500" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-ink">{stageLabel(student.placementStatus)}</p>
            <p className="text-xs text-muted mt-1">Roll no. {student.rollNo}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent applications</CardTitle>
            <LinkButton href="/student/drives" variant="ghost" size="sm">
              View all
            </LinkButton>
          </CardHeader>
          <CardContent className="space-y-3">
            {student.applications.length === 0 && (
              <p className="text-sm text-muted">No applications yet — check eligible drives.</p>
            )}
            {student.applications.map((app) => (
              <div key={app.id} className="flex items-center justify-between py-2 border-b border-border-soft last:border-0">
                <div>
                  <p className="text-sm font-medium text-ink">{app.drive.jobRole}</p>
                  <p className="text-xs text-muted">{app.drive.companyName}</p>
                </div>
                <div className="text-right">
                  {app.fitScore != null && (
                    <p className="text-sm font-semibold text-brand-600">{app.fitScore}/100</p>
                  )}
                  <Badge tone="brand">{stageLabel(app.stage)}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Unread notifications</CardTitle>
            <Bell className="h-4 w-4 text-brand-500" />
          </CardHeader>
          <CardContent className="space-y-3">
            {student.notifications.length === 0 && (
              <p className="text-sm text-muted">You&apos;re all caught up.</p>
            )}
            {student.notifications.map((n) => (
              <div key={n.id} className="py-2 border-b border-border-soft last:border-0">
                <p className="text-sm font-medium text-ink">{n.title}</p>
                <p className="text-xs text-muted mt-0.5">{n.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
