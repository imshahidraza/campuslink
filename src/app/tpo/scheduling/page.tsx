import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/Card";
import { TpoScheduleResponse } from "@/components/dashboard/TpoScheduleResponse";
import { AlertTriangle } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

export default async function SchedulingPage() {
  const interviews = await prisma.interview.findMany({
    include: { drive: true, application: { include: { student: { include: { user: true } } } } },
    orderBy: { scheduledAt: "asc" },
  });

  const requests = await prisma.scheduleRequest.findMany({
    include: { drive: { select: { jobRole: true, companyName: true } } },
    orderBy: { updatedAt: "desc" },
  });
  // Requests that need the placement cell's answer come first.
  const order = { WAITING_TPO: 0, WAITING_RECRUITER: 1, CONFIRMED: 2 } as const;
  requests.sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Interview Scheduling</h1>
      <p className="text-muted text-sm mt-1">
        Agree interview dates with each recruiter, and see every scheduled round across drives. Double-booked
        students, rooms and panels are caught automatically.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Interview date requests</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <p className="text-xs text-muted mb-2 leading-relaxed">
            Each recruiter asks for dates here. Confirm one or more, with the panels and rooms, or suggest other dates.
            After that the recruiter books each student&apos;s time inside the confirmed window.
          </p>
          {requests.length === 0 && <p className="text-sm text-muted">No recruiter has asked for interview dates yet.</p>}
          {requests.map((r) => (
            <TpoScheduleResponse
              key={r.id}
              driveId={r.driveId}
              title={`${r.drive.jobRole} · ${r.drive.companyName}`}
              request={{
                status: r.status,
                dates: r.dates,
                startTime: r.startTime,
                endTime: r.endTime,
                panelCount: r.panelCount,
                venue: r.venue,
                panels: r.panels,
                note: r.note,
                agreedDates: r.agreedDates,
                agreedStart: r.agreedStart,
                agreedEnd: r.agreedEnd,
                agreedVenue: r.agreedVenue,
                agreedPanels: r.agreedPanels,
              }}
            />
          ))}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Scheduled interviews</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 space-y-3">
          {interviews.length === 0 && (
            <p className="text-sm text-muted">
              No interviews are booked yet. Recruiters book them after you confirm their dates.
            </p>
          )}
          {interviews.map((iv) => (
            <div key={iv.id} className="flex items-center justify-between border-b border-border-soft py-3 last:border-0">
              <div>
                <p className="text-sm font-medium text-ink">
                  {iv.application.student.user.name}, {iv.stage}
                </p>
                <p className="text-xs text-muted">
                  {iv.drive.jobRole} · {iv.drive.companyName} · {fmtDateTime(iv.scheduledAt)}
                  {iv.venue ? ` · ${iv.venue}` : ""}
                  {iv.panel ? ` · Panel: ${iv.panel}` : ""}
                </p>
                {iv.overridden && (
                  <p className="text-xs text-amber-700 mt-0.5">
                    Scheduled despite: {iv.conflictNote}
                    {iv.overrideReason ? ` (Reason: ${iv.overrideReason})` : ""}
                  </p>
                )}
              </div>
              {iv.overridden ? (
                <Badge tone="warning" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> TPO override
                </Badge>
              ) : iv.hasConflict ? (
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
