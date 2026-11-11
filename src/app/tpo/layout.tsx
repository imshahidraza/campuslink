import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { runChecksIfDue } from "@/lib/automation";

export default async function TpoLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "TPO") redirect("/login");

  runChecksIfDue(); // reminders and the support list; runs at most every 10 minutes and never delays the page
  const notificationCount = await prisma.tpoNotification.count({ where: { read: false } });

  return (
    <DashboardShell role="tpo" userName={session.name} notificationCount={notificationCount}>
      {children}
    </DashboardShell>
  );
}
