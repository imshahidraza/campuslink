import { requireStudentOrRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/Card";
import { MarkReadButton } from "@/components/dashboard/MarkReadButton";
import { markNotificationReadAction } from "@/lib/actions/student";
import { cn } from "@/lib/utils";

export default async function NotificationsPage() {
  const { student } = await requireStudentOrRedirect();
  const notifications = await prisma.notification.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
      <p className="text-muted text-sm mt-1">Drive announcements, shortlists, interviews, and offers.</p>

      <div className="mt-8 space-y-3">
        {notifications.length === 0 && <p className="text-sm text-muted">Nothing here yet.</p>}
        {notifications.map((n) => (
          <Card key={n.id} className={cn(!n.read && "border-brand-300")}>
            <CardContent className="pt-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">{n.title}</p>
                <p className="text-sm text-muted mt-1">{n.message}</p>
                <p className="text-[11px] text-muted mt-2">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              {!n.read && <MarkReadButton onMarkRead={markNotificationReadAction.bind(null, n.id)} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
