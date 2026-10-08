import { LinkButton } from "@/components/ui/Button";
import { ParallaxController } from "@/components/landing/ParallaxController";
import { CustomCursor } from "@/components/landing/CustomCursor";
import { Petal, Ring, Plus, DotGrid, Arc } from "@/components/landing/Symbols";
import {
  ArrowRight,
  Sparkles,
  Target,
  CalendarClock,
  BarChart3,
  Eye,
  ShieldCheck,
  GraduationCap,
  Building2,
  Users,
  Check,
} from "lucide-react";

const pipeline = ["Profile", "Readiness", "Job Matching", "Explainability", "Shortlisting", "Scheduling", "Interview", "Offer", "Joining", "Analytics"];

const features = [
  { icon: Sparkles, title: "AI-powered readiness analysis", desc: "Every student gets a clear readiness level, strengths, and skill gaps — with the reasoning behind it." },
  { icon: Target, title: "Explainable Fit Score", desc: "Gemma reads the JD and the profile, then scores the match with matched skills, gaps, and evidence." },
  { icon: Eye, title: "Transparent for students", desc: "Students see exactly why they fit a drive, and what to improve — no black box." },
  { icon: CalendarClock, title: "Conflict-aware scheduling", desc: "Student, venue, and panel double-bookings are caught automatically before they become a problem." },
  { icon: ShieldCheck, title: "Human-in-the-loop", desc: "AI recommends and explains. The TPO and recruiter always make the final call." },
  { icon: BarChart3, title: "Placement analytics", desc: "Specialization-wise, skill-wise, and outcome insights — plus early identification of at-risk students." },
];

const personas = [
  { icon: GraduationCap, title: "Students", desc: "Understand your readiness, see your fit for every drive, and track your journey end to end." },
  { icon: Users, title: "TPO / Placement Cell", desc: "One system for programs, drives, AI shortlisting, scheduling, offers, and analytics." },
  { icon: Building2, title: "Recruiters", desc: "Post a drive and get explainable, ranked candidates — skip the spreadsheets entirely." },
];

const steps = ["Profile complete", "Readiness analysed", "Matched to drive", "Shortlisted"];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white overflow-x-clip">
      <ParallaxController />
      <CustomCursor />

      {/* NAV */}
      <header className="absolute top-0 inset-x-0 z-30">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 flex items-center justify-between h-20">
          <div className="flex items-center gap-2.5 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="CampusLink" className="h-9 w-9 rounded-lg" />
            <span className="font-serif text-2xl tracking-tight">CampusLink</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
            <a href="#pipeline" className="hover:text-white transition-colors">How it works</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#roles" className="hover:text-white transition-colors">Who it&apos;s for</a>
          </nav>
          <LinkButton href="/login" variant="outline-light" size="sm">Sign in</LinkButton>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-hero-gradient relative overflow-hidden pt-36 pb-32">
        {/* back layer: slow glows */}
        <div data-parallax data-speed="0.4" className="absolute -top-40 -left-40 h-[560px] w-[560px] rounded-full bg-brand-500/30 blur-3xl" />
        <div data-parallax data-speed="0.3" className="absolute top-40 -right-32 h-[420px] w-[420px] rounded-full bg-accent-lime/10 blur-3xl" />
        {/* mid layer: abstract symbols */}
        <div data-parallax data-speed="0.25" data-rotate="4" data-depth="14" className="absolute -top-16 right-[8%]">
          <Petal className="h-[380px] w-[380px] text-brand-500/30" />
        </div>
        <div data-parallax data-speed="0.15" data-rotate="-3" data-depth="18" className="absolute bottom-10 -left-24">
          <Ring className="h-[340px] w-[340px] text-brand-300/25" />
        </div>
        <div data-parallax data-speed="-0.08" data-depth="26" className="absolute top-48 left-[46%] hidden md:block">
          <Plus className="h-8 w-8 text-accent-lime/80" />
        </div>
        <div data-parallax data-speed="0.1" data-depth="22" className="absolute bottom-24 left-[38%] hidden md:block">
          <DotGrid className="h-20 w-20 text-brand-200/40" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8 grid lg:grid-cols-2 gap-14 items-center">
          {/* text (front-ish) */}
          <div data-parallax data-speed="-0.06" data-depth="8" className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs text-brand-200 mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered Campus-to-Corporate Placement Platform
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white leading-[1.08] tracking-tight">
              Aligning <span className="font-serif italic font-normal text-brand-200">Campus</span>-to-
              <span className="font-serif italic font-normal text-brand-200">Corporate</span>, intelligently.
            </h1>
            <p className="mt-6 text-lg text-white/60 leading-relaxed">
              One system replaces spreadsheets, WhatsApp groups, and manual shortlisting — connecting students, the placement cell, and recruiters from profile to joining.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <LinkButton href="/login" size="lg">Get started <ArrowRight className="h-4 w-4" /></LinkButton>
              <LinkButton href="#pipeline" variant="outline-light" size="lg">See how it works</LinkButton>
            </div>
          </div>

          {/* nested depth composition: panel (back) > fit card (middle) > chip (front) */}
          <div className="relative h-[440px]">
            <div data-parallax data-speed="0.05" data-depth="8" className="absolute inset-0">
              <div data-tilt className="relative h-full rounded-3xl card-glass p-6">
                <p className="text-xs text-brand-200 mb-4">Placement pipeline</p>
                <ul className="space-y-3">
                  {steps.map((s) => (
                    <li key={s} className="flex items-center gap-3 text-sm text-white/70">
                      <span className="h-5 w-5 rounded-full bg-brand-500/60 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>

                <div data-parallax data-speed="-0.1" data-depth="18" className="absolute left-6 right-10 bottom-8">
                  <div className="relative rounded-2xl bg-white p-5 shadow-2xl shadow-black/30">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xs text-muted">AI Fit Score</p>
                        <p className="text-3xl font-semibold text-ink mt-1">87<span className="text-base text-muted"> / 100</span></p>
                      </div>
                      <p className="text-xs text-muted">6 matched · 1 gap</p>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full w-[87%] rounded-full bg-brand-500" />
                    </div>

                    <div data-parallax data-speed="-0.2" data-depth="30" className="absolute -top-6 -right-6">
                      <div className="rounded-full bg-accent-lime px-4 py-2 text-xs font-semibold text-brand-900 shadow-lg">
                        Highly Ready
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div data-parallax data-speed="-0.14" data-depth="34" className="absolute -bottom-6 -left-6 hidden sm:block">
              <Petal className="h-16 w-16 text-accent-lime" />
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="border-b border-border-soft">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-10 text-center">
          <p className="text-sm text-muted">One master profile. Three roles. A single connected placement journey.</p>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section id="roles" className="bg-brand-950 py-28 relative overflow-hidden">
        <div data-parallax data-speed="0.3" data-rotate="-5" className="absolute -right-32 top-10">
          <Petal className="h-[420px] w-[420px] text-brand-600/30" />
        </div>
        <div data-parallax data-speed="0.18" data-depth="16" className="absolute left-[6%] bottom-10">
          <Ring className="h-44 w-44 text-brand-300/20" />
        </div>
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <p className="text-brand-200 text-sm mb-3">Who it&apos;s for</p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-white max-w-xl">
            Three roles, <span className="font-serif italic font-normal text-brand-200">one</span> connected system
          </h2>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
            {personas.map((p, i) => (
              <div key={p.title} data-parallax data-speed={["-0.03", "-0.09", "-0.15"][i]}>
                <div data-tilt className="card-glass rounded-2xl p-7 h-full">
                  <p.icon className="h-6 w-6 text-accent-lime" />
                  <h3 className="mt-5 text-white font-medium text-lg">{p.title}</h3>
                  <p className="mt-2 text-white/55 text-sm leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-28 bg-surface relative overflow-hidden">
        <div data-parallax data-speed="0.25" data-depth="12" className="absolute left-[3%] top-16">
          <DotGrid className="h-24 w-24 text-brand-400/30" />
        </div>
        <div data-parallax data-speed="0.2" data-rotate="6" className="absolute -right-16 bottom-0">
          <Arc className="h-40 w-64 text-brand-200" />
        </div>
        <div data-parallax data-speed="-0.06" data-depth="24" className="absolute right-[12%] top-24 hidden md:block">
          <Plus className="h-7 w-7 text-brand-500/60" />
        </div>
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <p className="text-brand-500 text-sm mb-3 font-medium">Everything you need</p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-ink max-w-xl">
            Intelligent placement management, <span className="font-serif italic font-normal text-brand-500">end to end</span>
          </h2>
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div key={f.title} data-parallax data-speed={["-0.02", "-0.05", "-0.08"][i % 3]}>
                <div className="rounded-2xl border border-border-soft bg-white p-6 h-full">
                  <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center">
                    <f.icon className="h-5 w-5 text-brand-600" />
                  </div>
                  <h3 className="mt-5 font-medium text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PIPELINE */}
      <section id="pipeline" className="py-28 bg-white border-t border-border-soft relative overflow-hidden">
        {/* giant outlined text drifting sideways as you scroll */}
        <div data-parallax data-x="0.35" className="absolute top-6 left-0 whitespace-nowrap select-none pointer-events-none">
          <span className="text-outline font-serif italic text-[9rem] leading-none">Campus → Corporate → Campus → Corporate</span>
        </div>
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8 pt-16">
          <p className="text-brand-500 text-sm mb-3 font-medium">The core pipeline</p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-ink max-w-xl">
            From profile to placement, <span className="font-serif italic font-normal text-brand-500">in one flow</span>
          </h2>
          <div className="mt-14 flex flex-wrap gap-3">
            {pipeline.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <div className="rounded-full border border-border-soft bg-surface px-4 py-2 text-sm text-ink whitespace-nowrap">
                  <span className="text-brand-500 font-medium mr-1.5">{i + 1}</span>
                  {step}
                </div>
                {i < pipeline.length - 1 && <ArrowRight className="h-4 w-4 text-muted/50 hidden sm:block" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-panel-gradient py-28 relative overflow-hidden">
        <div data-parallax data-speed="0.3" data-rotate="5" className="absolute -left-24 -top-24">
          <Petal className="h-[360px] w-[360px] text-white/[0.06]" />
        </div>
        <div data-parallax data-speed="0.2" data-depth="20" className="absolute right-[8%] bottom-6">
          <Ring className="h-48 w-48 text-white/15" />
        </div>
        <div data-parallax data-speed="-0.1" data-depth="28" className="absolute left-[18%] bottom-16 hidden md:block">
          <Plus className="h-8 w-8 text-accent-lime" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-5xl font-semibold text-white">
            Ready to align <span className="font-serif italic font-normal text-brand-200">campus</span> to corporate?
          </h2>
          <p className="mt-4 text-white/60">Choose your role and create your account in under a minute.</p>
          <div className="mt-8">
            <LinkButton href="/login" size="lg">Get started <ArrowRight className="h-4 w-4" /></LinkButton>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-brand-950 py-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="CampusLink" className="h-7 w-7 rounded-md" />
            <span className="font-serif text-lg">CampusLink</span>
          </div>
          <p className="text-white/40 text-xs">AI-assisted, not autonomous — decisions stay human.</p>
        </div>
      </footer>
    </div>
  );
}
