import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "RECRUITER") redirect("/login");

  const recruiter = await prisma.recruiter.findUnique({ where: { userId: session.userId } });
  const notificationCount = recruiter
    ? await prisma.recruiterNotification.count({ where: { recruiterId: recruiter.id, read: false } })
    : 0;

  return (
    <DashboardShell role="recruiter" userName={session.name} notificationCount={notificationCount}>
      {children}
    </DashboardShell>
  );
}
