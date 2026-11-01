"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { LogOut, Menu, X } from "lucide-react";
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
    { label: "Notifications", href: "/tpo/notifications", icon: Bell },
    { label: "Analytics", href: "/tpo/analytics", icon: BarChart3 },
  ],
  recruiter: [
    { label: "Overview", href: "/recruiter", icon: LayoutDashboard },
    { label: "Company Profile", href: "/recruiter/profile", icon: Building2 },
    { label: "My Drives", href: "/recruiter/drives", icon: Briefcase },
    { label: "Candidates", href: "/recruiter/candidates", icon: Users },
    { label: "Notifications", href: "/recruiter/notifications", icon: Bell },
  ],
};

const NOTIFICATIONS_HREF: Record<DashboardRole, string> = {
  student: "/student/notifications",
  tpo: "/tpo/notifications",
  recruiter: "/recruiter/notifications",
};

const ROLE_LABEL: Record<DashboardRole, string> = {
  student: "Student",
  tpo: "Placement Cell",
  recruiter: "Recruiter",
};

export function DashboardShell({
  role,
  userName,
  notificationCount = 0,
  children,
}: {
  role: DashboardRole;
  userName: string;
  notificationCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = NAV_CONFIG[role];
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const sidebarContent = (
    <>
      <div className="h-20 flex items-center justify-between px-6 text-white font-semibold">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpeg" alt="C-Link" className="h-9 w-9 rounded-lg" />
          <span className="font-serif text-2xl font-normal tracking-tight">C-Link</span>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden text-white/60 hover:text-white"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          const showBadge = item.href === NOTIFICATIONS_HREF[role] && notificationCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                active ? "bg-white/10 text-white" : "text-white/55 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent-lime text-brand-900 text-[11px] font-semibold flex items-center justify-center">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
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
    </>
  );

  return (
    <ToastProvider>
      <div className="min-h-screen bg-surface flex flex-col md:flex-row">
        {/* Mobile top bar */}
        <div className="md:hidden h-16 shrink-0 bg-brand-950 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="C-Link" className="h-8 w-8 rounded-lg" />
            <span className="font-serif text-xl tracking-tight">C-Link</span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="relative text-white/80 hover:text-white p-1"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent-lime" />
            )}
          </button>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="relative z-50 w-72 max-w-[82vw] bg-brand-950 flex flex-col h-full">
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-64 shrink-0 bg-brand-950 flex-col">{sidebarContent}</aside>

        <main className="flex-1 min-w-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
            <ScrollReveal />
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
