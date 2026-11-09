import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function TpoLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "TPO") redirect("/login");

  const notificationCount = await prisma.tpoNotification.count({ where: { read: false } });

  return (
    <DashboardShell role="tpo" userName={session.name} notificationCount={notificationCount}>
      {children}
    </DashboardShell>
  );
}
