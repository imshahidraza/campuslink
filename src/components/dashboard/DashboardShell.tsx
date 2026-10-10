"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import {
  LayoutDashboard,
  UserCircle,
  Gauge,
  Briefcase,
  Route,
  Bell,
  Users,
  Building2,
  CalendarClock,
  Award,
  BarChart3,
  GraduationCap,
} from "lucide-react";
import { OllamaStatus } from "./OllamaStatus";
import { ToastProvider } from "@/components/ui/Toast";

export type DashboardRole = "student" | "tpo" | "recruiter";

const NAV_CONFIG: Record<
  DashboardRole,
  { label: string; href: string; icon: typeof LayoutDashboard }[]
> = {
  student: [
    { label: "Overview", href: "/student", icon: LayoutDashboard },
    { label: "Profile", href: "/student/profile", icon: UserCircle },
    { label: "Readiness", href: "/student/readiness", icon: Gauge },
    { label: "Drives & Matching", href: "/student/drives", icon: Briefcase },
    { label: "Placement Journey", href: "/student/journey", icon: Route },
    { label: "Notifications", href: "/student/notifications", icon: Bell },
  ],
  tpo: [
    { label: "Overview", href: "/tpo", icon: LayoutDashboard },
    { label: "College Setup", href: "/tpo/college-setup", icon: GraduationCap },
    { label: "Students", href: "/tpo/students", icon: Users },
    { label: "Recruiters", href: "/tpo/recruiters", icon: Building2 },
    { label: "Drives", href: "/tpo/drives", icon: Briefcase },
    { label: "Scheduling", href: "/tpo/scheduling", icon: CalendarClock },
    { label: "Offers", href: "/tpo/offers", icon: Award },
    { label: "Analytics", href: "/tpo/analytics", icon: BarChart3 },
  ],
  recruiter: [
    { label: "Overview", href: "/recruiter", icon: LayoutDashboard },
    { label: "Company Profile", href: "/recruiter/profile", icon: Building2 },
    { label: "My Drives", href: "/recruiter/drives", icon: Briefcase },
    { label: "Candidates", href: "/recruiter/candidates", icon: Users },
  ],
};

const ROLE_LABEL: Record<DashboardRole, string> = {
  student: "Student",
  tpo: "Placement Cell",
  recruiter: "Recruiter",
};

export function DashboardShell({
  role,
  userName,
  children,
}: {
  role: DashboardRole;
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = NAV_CONFIG[role];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <ToastProvider>
    <div className="min-h-screen bg-surface flex">
      <aside className="w-64 shrink-0 bg-brand-950 flex flex-col">
        <div className="h-20 flex items-center gap-2.5 px-6 text-white font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpeg" alt="C-Link" className="h-9 w-9 rounded-lg" />
          <span className="font-serif text-2xl font-normal tracking-tight">C-Link</span>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/55 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-5 pt-3 border-t border-white/10">
          <OllamaStatus />
          <div className="px-3 py-2">
            <p className="text-white text-sm font-medium truncate">{userName}</p>
            <p className="text-white/40 text-xs">{ROLE_LABEL[role]}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/55 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-10">{children}</div>
      </main>
    </div>
    </ToastProvider>
  );
}
