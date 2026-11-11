# C-Link

AI-powered campus-to-corporate placement platform, built for the BPUT Hackathon 2026 finals (Problem Statement 10).

One system replaces spreadsheets, WhatsApp groups and manual shortlisting. It connects **students**, the **placement cell (TPO)** and **recruiters** from profile to joining. **AI advises, humans decide.**

> The screens say "C-Link". The code, database and package keep the name `campuslink`.

**Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind v4, Prisma 6 + PostgreSQL, Zod, and a **local** Ollama model (Gemma, set by `OLLAMA_MODEL`) for every AI feature. Responsive, works on desktop and phones.

## Run it

```bash
npm install
cp .env.example .env     # then edit it (see below)
npm run db:generate
npm run db:migrate
npm run dev              # http://localhost:3000
```

Keep `ollama serve` running with the model set in `OLLAMA_MODEL`.

### Environment (`.env`)

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection string. |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | The local AI server and model. |
| `JWT_SECRET` | Signs the login cookie. **Production refuses a missing, short or placeholder value.** Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `TPO_SIGNUP_CODE` | Private code needed to register a placement-cell account. If it is not set, only the very first TPO can ever register. |
| `TZ` (optional) | Set to `Asia/Kolkata` on a server so interview times stay in IST. |
| `OFFER_FOLLOW_UP_DAYS` (optional) | Days before the recruiter is prompted about an offer nobody has answered (default 3). Set to `1` only to show it in a demo. |

### Production

```bash
npm run build
npm start
```

Use either `npm run dev` or `npm run build` + `npm start` on a given day, not both. If you see a React hydration or "error #441", stop the server, delete the `.next` folder, and start again in one mode.

### Upgrading a database that already has data

The offer, automation and support-list features add **optional columns and one new table**. Nothing is deleted or rewritten.

```bash
# 1. Back up first
pg_dump "$DATABASE_URL" > backup.sql
# 2. Apply the additive upgrade (safe to run twice)
npx prisma db execute --file prisma/upgrade/jury-features.sql --schema prisma/schema.prisma
# 3. Refresh the client
npx prisma generate
```

After that, **do not run `prisma migrate dev` or `npm run db:reset`** on this database: they would see the extra columns as drift and offer to wipe it. A brand-new empty database can still use `npm run db:migrate`.

### Resetting test data

```bash
npx prisma migrate reset --force
npm run db:generate
npm run db:migrate
```

## How accounts and data work

* **TPO (placement cell):** TPO signup is not open to the public. It needs the placement cell signup code (`TPO_SIGNUP_CODE`). If no code is set, only the very first TPO can register, and after that signup is closed. The first TPO names the college, with an optional email domain. Every later TPO joins that same college.
* **Programs** are free text, with B.Tech, MCA and MBA shown as suggestions. They are always saved in capitals with tidy spacing, so "mca" and "MCA " become the same program.
* **Students don't type their own academic data.** The TPO imports it first:
  * TPO → Students → Add students. Paste rows from a spreadsheet, type them in, or import a .csv file. Columns can be in any order as long as the first row has recognisable headers (Roll No, Name, Program, Specialization, CGPA, Backlogs, Graduation Year).
  * Assessment scores (aptitude, reasoning, verbal, communication) are optional columns in the same file. They feed the AI readiness check, and if they are missing it runs without them.
  * A student then signs up with name, email, password and roll number. Everything else comes from the TPO's import and is read-only on their profile. Roll numbers are not case-sensitive; passwords are.
* **Recruiters** sign up with a company name and a phone number. They cannot create drives until the placement cell approves the account.

## First-time flow

1. TPO signs up (names the college), then adds students (paste or CSV).
2. Students sign up with their roll number.
3. Recruiter signs up, and the TPO approves the account.
4. Recruiter posts a drive (the job description is AI-parsed) and opens it.
5. Students see the drives they qualify for, check their AI fit, and apply. A student who is not eligible is told why and what would change it.
6. Recruiter shortlists, then asks for interview dates. The TPO confirms the dates and panels.
7. Recruiter schedules interviews, selects candidates and requests offers. The TPO forwards each offer to the student, and the student accepts or declines.
8. After the student's documents are verified, joining is confirmed by the TPO or the owning recruiter.

## Interview scheduling

* The recruiter proposes up to three dates, a time window and a number of panels. The TPO either confirms (naming the panels, optionally with rooms) or counters with a reason. The recruiter can accept a counter.
* Interviews can be booked only inside the confirmed window. A student cannot have two overlapping interviews, a panel cannot be double-booked, and a panel's room cannot be used twice at the same time. Names are compared ignoring case and spaces. There is no override.
* **Schedule everyone shortlisted** builds a preview timetable (round name, date, minutes per interview, optional gap and break). Nothing is saved until the recruiter confirms. Students are placed in roll-number order, so slot order is neutral.

## The offer pipeline

Offers originate with the **recruiter**:

1. Recruiter marks a candidate **Selected**, then clicks **Request offer** with a package and an optional message.
2. Until the TPO forwards it, the recruiter can **edit** or **cancel** the request.
3. TPO reviews it on **Offers** and clicks **Send to student**.
4. Student sees **Accept / Decline** on their Placement Journey. Declining affects only that application.
5. After it is sent, or accepted, the recruiter can **withdraw** the offer with a written reason. The student goes back to Selected, the student and TPO are notified, and a corrected offer can be sent.
6. If accepted, the TPO verifies the student's documents. Then the TPO, or the recruiter who owns the offer, marks the student **Joined**. The record shows who confirmed it, and only the TPO can undo it.
7. A student who has joined cannot apply to other drives. The server blocks it, and the Apply button is faded with the company name shown.

Stages: Applied → Shortlisted → Interview → Selected → Offer requested → Offer sent → Offer accepted → Joined. Side branches: Not selected, Offer declined, Withdrawn.

## Offer terms, deferral and conversion

* Every offer has a **type**: Internship, PPO (pre-placement offer) or Full-time. Offers made before this update show as Full-time with their old package text.
* Full-time and PPO offers carry **CTC in LPA** (stored as a number, so averages and trends are exact). Internship offers carry a **monthly stipend**. An optional **joining bond** (months and a note) and **joining date** can be added.
* An accepted internship does **not** count as placed. When the recruiter clicks **Convert to full-time** on it, a new full-time offer goes through the same steps (placement cell forwards it, student accepts or declines).
* After accepting, a student can **request a joining-date deferral** with a reason and the new date. The placement cell approves or declines (a decline needs a written reason). An approved date replaces the joining date everywhere, and the old date is kept.

## Command dashboard (TPO -> Analytics)

Offers made, accepted and pending; average and highest package; package trend by month; recruiter pipeline and repeat hiring; branch-wise conversion; document and joining summary. All numbers are plain counts and averages of real records. Internships are shown separately and never counted as placed.

## Workflow automation (in-app only, no email or SMS)

* **Drive announcements:** opening a drive notifies only the students who are eligible for it. The TPO can announce again to those who have not applied yet, at most once every 10 minutes.
* **Document deadlines:** accepting an offer sets a deadline 7 days out (the TPO can change it). The student is reminded 2 days before and told when it is overdue; the TPO is told about overdue ones.
* **Recruiter follow-ups:** an offer with no student answer after 3 days prompts the recruiter and reminds the student (up to 3 times).
* **Support list (TPO -> Support list):** students with a plain-rule risk reason (not ready, repeated rejections with nothing active, no applications despite an open eligible drive for a week) are listed. The TPO assigns a mentor and records notes; the entry closes by itself when the student is placed. Nobody is auto-rejected or ranked.
* Checks run on their own every 10 minutes while someone is using the site, and the TPO can press **Run checks now**. Each reminder is claimed in the database before it is sent, so it cannot be sent twice.

## Student assistant and interview practice

* **Eligibility Assistant:** the student asks "Am I eligible for TCS?", "Why not?", "What is the last date?". The answer comes from the exact rules and the student's own record. The local AI is optional and only rewords it; wording that adds any number or verdict not in the facts is thrown away.
* **Interview Practice:** practice questions for a drive's job description, based on the student's own missing skills. Generated by the local AI, rate-limited.

## Evaluation

`npm run evaluate` runs the fit score repeatedly on sample pairs and reports consistency and timing. See `docs/EVALUATION.md`. `npm run selftest` runs 37 quick checks of the plain rules (offers, deferral, reminders, risk list, analytics, assistant).

## AI features

All AI runs locally through Ollama (Gemma), one request at a time, with the model kept loaded for 30 minutes. A fit check can take up to a minute.

* **Fit score** for a student and a drive: matched skills, missing skills and a short explanation. The student sees their own fit privately.
* **Readiness check**, **preparation plan** and **skills roadmap** for students. The roadmap ranks missing skills by how many open drives ask for them (a plain rule); AI only writes the learning tips.
* Resume and job description parsing.
* The AI never selects, rejects or ranks anyone for a recruiter. Every decision is a human action.

## Security

* Passwords hashed with bcrypt. Login token in an httpOnly cookie (never local storage).
* Rate limits on login, sign-up and uploads.
* Role and ownership checks on every server action and route. Hiding a button is only for convenience.
* Zod validation on input, Prisma parameterised queries (no raw SQL), React escaping for output.
* Production refuses a weak `JWT_SECRET`. Browser source maps and the framework header are off. Frames are denied, and content-type sniffing is off.
* Every new action checks the role, the ownership of the record and the stage on the server, and applies each change in a single guarded database update so a double click or a replayed request cannot apply it twice.
* Not built yet: multi-factor login.

## Notifications

Students, recruiters and the TPO each get in-app notifications for the events that concern them (shortlists, interview times, offers, approvals, withdrawals, joining). The sidebar shows an unread badge. TPO notifications are shared by all TPO accounts at the college, a deliberate simplification for this single-college build.

## Notes

* Every save or action confirms with a toast notification.
* Eligibility rules and scheduling clash checks are plain TypeScript in `src/lib/rules.ts`. Gemma handles resume and job description understanding, fit explanations and readiness.
* This build is **single-college**: one shared roster, no separate data per college.
* "Specialization" is the term on screen. The database field is still called `branch`.
* Reset a user's password from the command line with `npm run reset-password`.
