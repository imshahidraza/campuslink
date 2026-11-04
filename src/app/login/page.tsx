"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, GraduationCap, Users, Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { ParallaxController } from "@/components/landing/ParallaxController";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Loader } from "@/components/ui/Loader";
import { Ring, Plus } from "@/components/landing/Symbols";

type Role = "STUDENT" | "TPO" | "RECRUITER";
type Mode = "login" | "register";

const ROLES: {
  id: Role;
  title: string;
  desc: string;
  icon: typeof Users;
  points: string[];
}[] = [
  {
    id: "STUDENT",
    title: "Student",
    desc: "See how ready you are, how well you fit each drive, and where every application stands.",
    icon: GraduationCap,
    points: ["Your roll number is your login", "Apply to drives you are eligible for", "Follow each application until you join"],
  },
  {
    id: "TPO",
    title: "Placement Cell",
    desc: "Set up your college, review recruiters, run drives and track every offer.",
    icon: Users,
    points: ["Approve recruiters before they post", "Schedule interviews without clashes", "Verify documents and mark students joined"],
  },
  {
    id: "RECRUITER",
    title: "Recruiter",
    desc: "Post a drive, review ranked candidates with reasons, and make the final call.",
    icon: Building2,
    points: ["The placement cell approves new accounts", "Shortlist, interview and select", "Request an offer when you are ready"],
  },
];

const inputCls =
  "w-full rounded-xl bg-white border border-border-soft px-4 py-3 text-ink placeholder:text-muted/70 text-sm focus:outline-none focus:border-brand-950 focus:ring-2 focus:ring-accent-lime/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [f, setF] = useState<Record<string, string>>({});
  const [college, setCollege] = useState<{ name: string } | null | undefined>(undefined);
  const [tpoSignup, setTpoSignup] = useState<"code" | "first" | "closed">("first");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [via, setVia] = useState<"email" | "phone">("email"); // sign-in identifier for TPO / Recruiter

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const roleInfo = ROLES.find((r) => r.id === role);

  useEffect(() => {
    if (role === "TPO" && mode === "register" && college === undefined) {
      fetch("/api/college").then((r) => r.json()).then((d) => { setCollege(d.college); setTpoSignup(d.tpoSignup ?? "first"); }).catch(() => setCollege(null));
    }
  }, [role, mode, college]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, role, method: mode === "login" && role !== "STUDENT" ? via : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }
      router.push(data.redirectPath);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Is the app running?");
      setLoading(false);
    }
  }

  const collegeLoading = role === "TPO" && mode === "register" && college === undefined;

  return (
    <div className="min-h-screen bg-hero-gradient relative overflow-hidden flex items-center justify-center px-5 sm:px-8 py-14">
      <ParallaxController />
      <ScrollReveal />
      <div data-parallax data-speed="0.15" data-depth="20" className="absolute -bottom-32 -left-24">
        <Ring className="h-[380px] w-[380px] text-brand-300/20" />
      </div>
      <div data-parallax data-depth="28" className="absolute top-24 left-[12%] hidden md:block"><Plus className="h-7 w-7 text-accent-lime/80" /></div>

      <div className="relative w-full max-w-6xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-white/55 text-sm mb-8 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </Link>

        {!role && (
          <div>
            <div className="flex items-center justify-center gap-2.5 text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpeg" alt="C-Link" className="h-10 w-10 rounded-lg" />
              <span className="font-serif text-3xl tracking-tight">C-Link</span>
            </div>
            <div className="text-center">
              <h1 className="mt-7 text-3xl sm:text-4xl font-semibold text-white">
                Sign in as <span className="font-serif italic font-normal text-accent-lime">who</span>?
              </h1>
              <p className="mt-3 text-white/60 max-w-md mx-auto">Pick the role that matches your account. You can switch any time.</p>
            </div>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch max-w-5xl mx-auto">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setRole(r.id); setMode("login"); setError(null); }}
                  className="group flex flex-col text-left card-glass rounded-2xl p-8 transition-all hover:-translate-y-1 hover:border-accent-lime/60 hover:bg-white/[0.07] h-full"
                >
                  <div className="h-12 w-12 rounded-xl bg-accent-lime flex items-center justify-center shrink-0">
                    <r.icon className="h-6 w-6 text-brand-950" />
                  </div>
                  <h2 className="mt-6 text-white font-medium text-xl leading-snug">{r.title}</h2>
                  <p className="mt-2.5 text-white/60 text-sm leading-relaxed flex-1">{r.desc}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm text-accent-lime group-hover:gap-2.5 transition-all">
                    Continue <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {role && roleInfo && (
          <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-center">
            <div className="lg:col-span-2 text-white">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpeg" alt="C-Link" className="h-10 w-10 rounded-lg" />
                <span className="font-serif text-3xl tracking-tight">C-Link</span>
              </div>
              <div className="mt-8 h-12 w-12 rounded-xl bg-accent-lime flex items-center justify-center">
                <roleInfo.icon className="h-6 w-6 text-brand-950" />
              </div>
              <h1 className="mt-5 text-3xl sm:text-4xl font-semibold leading-tight">{roleInfo.title}</h1>
              <p className="mt-3 text-white/60 leading-relaxed">{roleInfo.desc}</p>
              <ul className="mt-7 space-y-3 hidden sm:block">
                {roleInfo.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-3 text-sm text-white/75">
                    <span className="mt-0.5 h-5 w-5 rounded-full bg-accent-lime/15 flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3 text-accent-lime" />
                    </span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-3 rounded-3xl bg-white p-7 sm:p-10 shadow-2xl shadow-black/40 w-full max-w-xl lg:max-w-none mx-auto">
              <button onClick={() => { setRole(null); setError(null); setCollege(undefined); }} className="inline-flex items-center gap-1.5 text-muted text-sm mb-5 hover:text-ink">
                <ArrowLeft className="h-3.5 w-3.5" /> Change role
              </button>
              <h2 className="text-ink text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
              <p className="text-muted text-sm mt-1">
                {mode === "login" ? `Sign in to your ${roleInfo.title.toLowerCase()} account.` : `Set up a new ${roleInfo.title.toLowerCase()} account.`}
              </p>

              <div className="mt-6 grid grid-cols-2 rounded-full bg-surface-2 p-1 text-sm">
                {(["login", "register"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); }}
                    className={`rounded-full py-2 transition-colors ${mode === m ? "bg-brand-950 text-white font-medium" : "text-muted hover:text-ink"}`}
                  >
                    {m === "login" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                {mode === "register" && (
                  <Field label="Full name">
                    <input required className={inputCls} value={f.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Your full name" />
                  </Field>
                )}
                {role === "STUDENT" && mode === "login" ? (
                  <Field label="Roll number">
                    <input required className={inputCls} value={f.rollNo || ""} onChange={(e) => set("rollNo", e.target.value)} placeholder="e.g. 21CS101" autoCapitalize="characters" />
                  </Field>
                ) : (
                  <>
                    {mode === "login" && (
                      <div className="grid grid-cols-2 rounded-full bg-surface-2 p-1 text-xs">
                        {(["email", "phone"] as const).map((v) => (
                          <button
                            type="button"
                            key={v}
                            onClick={() => { setVia(v); setError(null); }}
                            className={`rounded-full py-1.5 transition-colors ${via === v ? "bg-white text-ink font-medium shadow-sm" : "text-muted hover:text-ink"}`}
                          >
                            {v === "email" ? "Use email" : "Use phone number"}
                          </button>
                        ))}
                      </div>
                    )}
                    {mode === "login" && via === "phone" ? (
                      <Field label="Phone number">
                        <input required type="tel" inputMode="tel" autoComplete="tel" className={inputCls} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="e.g. 98765 43210" />
                      </Field>
                    ) : (
                      <Field label="Email">
                        <input required type="email" className={inputCls} value={f.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
                      </Field>
                    )}
                    {mode === "register" && role !== "STUDENT" && (
                      <Field label="Phone number">
                        <input required type="tel" inputMode="tel" autoComplete="tel" className={inputCls} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="e.g. 98765 43210" />
                      </Field>
                    )}
                  </>
                )}
                <Field label="Password">
                  <PasswordField
                    required
                    minLength={mode === "register" ? 6 : undefined}
                    className={inputCls}
                    value={f.password || ""}
                    onChange={(v) => set("password", v)}
                    placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                  />
                </Field>

                {mode === "register" && role === "STUDENT" && (
                  <Field label="Roll number">
                    <input required className={inputCls} value={f.rollNo || ""} onChange={(e) => set("rollNo", e.target.value)} placeholder="e.g. 21CS101" autoCapitalize="characters" />
                  </Field>
                )}
                {mode === "register" && role === "STUDENT" && (
                  <p className="text-xs text-muted -mt-2 leading-relaxed">
                    Your placement cell has already added your program, specialization and CGPA. Enter your roll number and the rest fills in for you.
                  </p>
                )}

                {mode === "register" && role === "TPO" && (
                  <>
                    {collegeLoading && <p className="text-xs text-muted">Checking for an existing college...</p>}
                    {!collegeLoading && tpoSignup === "closed" && (
                      <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-2.5">
                        Placement cell signup is closed. Ask your administrator to set a signup code.
                      </p>
                    )}
                    {!collegeLoading && tpoSignup === "code" && (
                      <Field label="Placement cell signup code">
                        <PasswordField
                          required
                          className={inputCls}
                          value={f.tpoCode || ""}
                          onChange={(v) => set("tpoCode", v)}
                          placeholder="Given by your administrator"
                        />
                      </Field>
                    )}
                    {!collegeLoading && college && (
                      <p className="text-sm text-ink bg-brand-100 rounded-xl px-4 py-2.5">
                        You are joining <span className="font-semibold">{college.name}</span>, which another TPO has already set up.
                      </p>
                    )}
                    {!collegeLoading && !college && (
                      <>
                        <Field label="College name">
                          <input required className={inputCls} value={f.collegeName || ""} onChange={(e) => set("collegeName", e.target.value)} placeholder="e.g. Springfield Institute of Technology" />
                        </Field>
                        <Field label="College email domain (optional)">
                          <input className={inputCls} value={f.collegeEmailDomain || ""} onChange={(e) => set("collegeEmailDomain", e.target.value)} placeholder="e.g. springfield.edu" />
                        </Field>
                        <p className="text-xs text-muted -mt-2 leading-relaxed">
                          If you set this, students must sign up with an email on this domain, along with their roll number.
                        </p>
                      </>
                    )}
                  </>
                )}

                {mode === "register" && role === "RECRUITER" && (
                  <>
                    <Field label="Company name">
                      <input required className={inputCls} value={f.companyName || ""} onChange={(e) => set("companyName", e.target.value)} placeholder="Your company" />
                    </Field>
                    <Field label="Industry (optional)">
                      <input className={inputCls} value={f.industry || ""} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Software or Fintech" />
                    </Field>
                    <p className="text-xs text-muted -mt-2 leading-relaxed">
                      The placement cell approves every new recruiter. You can sign in right away, and you can post drives once you are approved.
                    </p>
                  </>
                )}

                {error && <p className="text-rose-700 text-sm bg-rose-50 rounded-xl px-4 py-2.5">{error}</p>}

                <Button type="submit" className="w-full" size="lg" disabled={loading || collegeLoading || (role === "TPO" && mode === "register" && tpoSignup === "closed")}>
                  {loading ? (<><Loader size="sm" onLight delayed={false} /> Please wait</>) : mode === "login" ? "Sign in" : "Create account"}
                </Button>
              </form>
            </div>
          </div>
        )}
        <p className={`mt-8 text-xs text-white/45 ${!role ? "text-center" : ""}`}>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-white/80">How we handle your data</Link>
        </p>
      </div>
    </div>
  );
}
