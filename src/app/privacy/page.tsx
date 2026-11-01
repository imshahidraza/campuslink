import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata = { title: "Privacy & data handling — C-Link" };

const ACCESS: { data: string; student: string; tpo: string; recruiter: string }[] = [
  { data: "Name, roll number, program, specialization", student: "Own", tpo: "All students", recruiter: "Applicants to their drives" },
  { data: "CGPA, backlogs, assessment scores", student: "Own", tpo: "All students", recruiter: "Not shown" },
  { data: "Resume PDF", student: "Own", tpo: "All students", recruiter: "Applicants to their drives only" },
  { data: "Skills, projects, AI fit score and explanation", student: "Own", tpo: "All students", recruiter: "Applicants to their drives" },
  { data: "Phone number and email", student: "Own", tpo: "Own (sign-in only)", recruiter: "Own (sign-in only)" },
  { data: "Rejection feedback notes", student: "Own", tpo: "Those they wrote", recruiter: "Those they wrote" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-5 sm:px-6 py-10 sm:py-14">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Back home
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-accent-lime flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-brand-900" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-ink">Privacy &amp; data handling</h1>
        </div>
        <p className="mt-3 text-sm text-muted">
          C-Link holds placement data about real people, so here is plainly what we store, who can see it, and
          where AI fits in.
        </p>

        <Section title="What we store">
          <p>
            <span className="font-medium text-ink">From your placement cell:</span> name, roll number, program,
            specialization, CGPA, backlogs, graduation year and assessment scores. This record is verified by the
            college, which is why students cannot edit it.
          </p>
          <p>
            <span className="font-medium text-ink">From you:</span> your account (email, or phone number for placement
            cell and recruiter accounts, plus a password), your skills, projects, certifications and experience, and
            optionally your resume PDF.
          </p>
          <p>
            Phone numbers are used only as an alternative way to sign in. They are not verified by code and are never
            shown to other users.
          </p>
        </Section>

        <Section title="Who can see what">
          <div className="overflow-x-auto rounded-xl border border-border-soft bg-white">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-surface-2 text-ink">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Data</th>
                  <th className="px-3 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Placement cell</th>
                  <th className="px-3 py-2.5 font-medium">Recruiter</th>
                </tr>
              </thead>
              <tbody>
                {ACCESS.map((r) => (
                  <tr key={r.data} className="border-t border-border-soft align-top">
                    <td className="px-3 py-2.5 text-ink">{r.data}</td>
                    <td className="px-3 py-2.5">{r.student}</td>
                    <td className="px-3 py-2.5">{r.tpo}</td>
                    <td className="px-3 py-2.5">{r.recruiter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            These limits are enforced on the server for every request, not just hidden in the screen. A recruiter cannot
            open a resume or a profile of a student who has not applied to one of their own drives.
          </p>
        </Section>

        <Section title="Your resume">
          <p>
            Your resume PDF is stored securely in the platform&apos;s database. It is shown only to the placement cell and to
            recruiters of drives you have applied to, and it is never served from a public link. You can replace or
            remove it from your profile at any time.
          </p>
        </Section>

        <Section title="How AI is used">
          <p>
            AI helps read resumes, understand job descriptions and explain a candidate&apos;s fit. It only advises. Eligibility
            is decided by fixed rules (CGPA, backlogs, program), and every shortlist, rejection and offer is decided by
            a person. The placement cell can override the AI, and every fit score comes with the reasons behind it.
          </p>
          <p>
            In the current setup, the AI model runs on the platform&apos;s own server, so resume text is not sent to a public
            AI service. If that changes, this page will say so.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Passwords are stored only as salted hashes, sessions use secure HTTP-only cookies, sign-in and sign-up are
            rate-limited, and uploaded files are checked before they are accepted. Error messages avoid revealing
            whether an account exists.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            Wrong academic data? Ask your placement cell to correct it. Want your resume removed? Remove it from your
            profile. For anything else about your data, contact your college&apos;s placement cell.
          </p>
        </Section>
      </div>
    </div>
  );
}
