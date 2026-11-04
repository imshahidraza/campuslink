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
      {recruiter && recruiter.status !== "APPROVED" && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
            recruiter.status === "PENDING"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {recruiter.status === "PENDING"
            ? "Your account is waiting for approval from the placement cell. You can look around, but you can post drives only after it is approved."
            : "The placement cell did not approve this account. Please contact them if you think this is a mistake."}
        </div>
      )}
      {children}
    </DashboardShell>
  );
}
