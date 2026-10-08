import { prisma } from "@/lib/prisma";
import { Card, CardContent, Badge } from "@/components/ui/Card";
import { AlertTriangle } from "lucide-react";

export default async function SchedulingPage() {
  const interviews = await prisma.interview.findMany({
    include: { drive: true, application: { include: { student: { include: { user: true } } } } },
    orderBy: { scheduledAt: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Interview Scheduling</h1>
      <p className="text-muted text-sm mt-1">
        All scheduled rounds across drives. Conflicts (student / venue / panel double-booking) are flagged
        automatically.
      </p>

      <Card className="mt-8">
        <CardContent className="pt-5 space-y-3">
          {interviews.length === 0 && (
            <p className="text-sm text-muted">
              No interviews scheduled yet — schedule one from a drive&apos;s application list.
            </p>
          )}
          {interviews.map((iv) => (
            <div key={iv.id} className="flex items-center justify-between border-b border-border-soft py-3 last:border-0">
              <div>
                <p className="text-sm font-medium text-ink">
                  {iv.application.student.user.name} — {iv.stage}
                </p>
                <p className="text-xs text-muted">
                  {iv.drive.jobRole} · {iv.drive.companyName} · {new Date(iv.scheduledAt).toLocaleString()}
                  {iv.venue ? ` · ${iv.venue}` : ""}
                  {iv.panel ? ` · Panel: ${iv.panel}` : ""}
                </p>
              </div>
              {iv.hasConflict ? (
                <Badge tone="danger" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Conflict
                </Badge>
              ) : (
                <Badge tone="success">Clear</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
