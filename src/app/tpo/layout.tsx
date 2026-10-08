import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function TpoLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "TPO") redirect("/login");

  return (
    <DashboardShell role="tpo" userName={session.name}>
      {children}
    </DashboardShell>
  );
}
