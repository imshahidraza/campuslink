"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, GraduationCap, Users, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { ParallaxController } from "@/components/landing/ParallaxController";
import { Petal, Ring, Plus, DotGrid } from "@/components/landing/Symbols";

type Role = "STUDENT" | "TPO" | "RECRUITER";
type Mode = "login" | "register";

const ROLES: { id: Role; title: string; desc: string; icon: typeof Users }[] = [
  { id: "STUDENT", title: "Student", desc: "Check your readiness, see AI fit scores, and track every application.", icon: GraduationCap },
  { id: "TPO", title: "Placement Cell (TPO)", desc: "Set up the college, run drives, shortlist, schedule and track offers.", icon: Users },
  { id: "RECRUITER", title: "Recruiter", desc: "Post a drive and review ranked, explainable candidates.", icon: Building2 },
];

const inputCls =
  "w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-brand-300";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-white/60 mb-1.5 block">{label}</span>
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const roleInfo = ROLES.find((r) => r.id === role);

  useEffect(() => {
    if (role === "TPO" && mode === "register" && college === undefined) {
      fetch("/api/college").then((r) => r.json()).then((d) => setCollege(d.college)).catch(() => setCollege(null));
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
        body: JSON.stringify({ ...f, role }),
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
    <div className="min-h-screen bg-hero-gradient relative overflow-hidden flex items-center justify-center px-6 py-16">
      <ParallaxController />
      <div data-parallax data-speed="0.2" data-depth="14" className="absolute -top-24 -right-24">
        <Petal className="h-[420px] w-[420px] text-brand-500/25" />
      </div>
      <div data-parallax data-speed="0.15" data-depth="20" className="absolute -bottom-32 -left-24">
        <Ring className="h-[380px] w-[380px] text-brand-300/20" />
      </div>
      <div data-parallax data-depth="28" className="absolute top-24 left-[12%] hidden md:block"><Plus className="h-7 w-7 text-accent-lime/80" /></div>
      <div data-parallax data-depth="22" className="absolute bottom-20 right-[14%] hidden md:block"><DotGrid className="h-20 w-20 text-brand-200/30" /></div>

      <div className={`relative w-full ${role ? "max-w-4xl" : "max-w-5xl"}`}>
        <div className={!role ? "flex justify-center" : ""}>
          <Link href="/" className="inline-flex items-center gap-1.5 text-white/50 text-sm mb-8 hover:text-white/80">
            <ArrowLeft className="h-3.5 w-3.5" /> Back home
          </Link>
        </div>

        <div className={`flex items-center gap-2.5 text-white mb-2 ${!role ? "justify-center" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpeg" alt="C-link" className="h-10 w-10 rounded-lg" />
          <span className="font-serif text-3xl tracking-tight">C-link</span>
        </div>

        {!role && (
          <>
            <div className="text-center">
              <h1 className="mt-6 text-3xl sm:text-4xl font-semibold text-white">
                Who&apos;s <span className="font-serif italic font-normal text-brand-200">signing in</span>?
              </h1>
              <p className="mt-2 text-white/55">Choose your role to continue.</p>
            </div>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setRole(r.id); setMode("login"); setError(null); }}
                  className="group flex flex-col text-left card-glass rounded-2xl p-6 transition-all hover:-translate-y-1 hover:border-brand-300/60 hover:bg-white/[0.07] h-full"
                >
                  <div className="h-11 w-11 rounded-xl bg-accent-lime flex items-center justify-center shrink-0">
                    <r.icon className="h-5 w-5 text-brand-900" />
                  </div>
                  <h2 className="mt-5 text-white font-medium text-lg leading-snug">{r.title}</h2>
                  <p className="mt-2 text-white/55 text-sm leading-relaxed flex-1">{r.desc}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-brand-200 group-hover:gap-2.5 transition-all">
                    Continue <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {role && roleInfo && (
          <div className="mt-6 card-glass rounded-2xl p-8 max-w-xl">
            <button onClick={() => { setRole(null); setError(null); setCollege(undefined); }} className="inline-flex items-center gap-1.5 text-white/50 text-sm mb-5 hover:text-white/80">
              <ArrowLeft className="h-3.5 w-3.5" /> Change role
            </button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent-lime flex items-center justify-center">
                <roleInfo.icon className="h-5 w-5 text-brand-900" />
              </div>
              <div>
                <h1 className="text-white text-xl font-semibold">{mode === "login" ? "Sign in" : "Create account"} as {roleInfo.title}</h1>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 rounded-full bg-white/5 p-1 text-sm">
              {(["login", "register"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={`rounded-full py-2 transition-colors ${mode === m ? "bg-white text-brand-900 font-medium" : "text-white/60 hover:text-white"}`}
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
                  <input required className={inputCls} value={f.rollNo || ""} onChange={(e) => set("rollNo", e.target.value)} placeholder="e.g. 21CS101" />
                </Field>
              ) : (
                <Field label="Email">
                  <input required type="email" className={inputCls} value={f.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
                </Field>
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
                  <input required className={inputCls} value={f.rollNo || ""} onChange={(e) => set("rollNo", e.target.value)} placeholder="e.g. 21CS101" />
                </Field>
              )}
              {mode === "register" && role === "STUDENT" && (
                <p className="text-xs text-white/45 -mt-2">
                  Your placement cell adds your roll number, program, specialization and CGPA ahead of time — enter your roll
                  number above and the rest fills in automatically.
                </p>
              )}

              {mode === "register" && role === "TPO" && (
                <>
                  {collegeLoading && <p className="text-xs text-white/45">Checking for an existing college...</p>}
                  {!collegeLoading && college && (
                    <p className="text-sm text-brand-200 bg-white/5 rounded-xl px-4 py-2.5">
                      Joining <span className="font-medium">{college.name}</span> — already set up by another TPO.
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
                      <p className="text-xs text-white/45 -mt-2">
                        If set, students must sign up with an email on this domain — an extra check alongside their
                        roll number.
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
                    <input className={inputCls} value={f.industry || ""} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Software / Fintech" />
                  </Field>
                </>
              )}

              {error && <p className="text-rose-300 text-sm">{error}</p>}

              <Button type="submit" className="w-full" size="lg" disabled={loading || collegeLoading}>
                {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
