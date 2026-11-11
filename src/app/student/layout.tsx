import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { runChecksIfDue } from "@/lib/automation";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "STUDENT") redirect("/login");

  runChecksIfDue();
  const student = await prisma.student.findUnique({ where: { userId: session.userId } });
  const notificationCount = student
    ? await prisma.notification.count({ where: { studentId: student.id, read: false } })
    : 0;

  return (
    <DashboardShell role="student" userName={session.name} notificationCount={notificationCount}>
      {children}
    </DashboardShell>
  );
}
