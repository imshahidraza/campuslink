# C-Link

AI-powered campus-to-corporate placement platform, built for the BPUT Hackathon 2026 finals (Problem Statement 10).

One system replaces spreadsheets, WhatsApp groups and manual shortlisting. It connects **students**, the **placement cell (TPO)** and **recruiters** from profile to joining. **AI advises, humans decide.**

> The screens say "C-Link". The code, database and package keep the name `campuslink`.

**Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind v4, Prisma 6 + PostgreSQL, Zod, and a **local** Ollama model (`gemma4:e4b`) for every AI feature. Responsive, works on desktop and phones.

## Run it

```bash
npm install
cp .env.example .env     # then edit it (see below)
npm run db:generate
npm run db:migrate
npm run dev              # http://localhost:3000
```

Keep `ollama serve` running with the model `gemma4:e4b`.

### Environment (`.env`)

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection string. |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | The local AI server and model. |
| `JWT_SECRET` | Signs the login cookie. **Production refuses a missing, short or placeholder value.** Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `TPO_SIGNUP_CODE` | Private code needed to register a placement-cell account. If it is not set, only the very first TPO can ever register. |
| `TZ` (optional) | Set to `Asia/Kolkata` on a server so interview times stay in IST. |

### Production

```bash
npm run build
npm start
```

Use either `npm run dev` or `npm run build` + `npm start` on a given day, not both. If you see a React hydration or "error #441", stop the server, delete the `.next` folder, and start again in one mode.

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

## Recruiter profile and key people

* **Profile setup** (Recruiter -> Profile setup): the recruiter's name and role, and the company's name, industry, website and about. The company name appears in the greeting on their Overview.
* **Company Profile** (Recruiter -> Company Profile): up to **3 key people** (for example CEO, HR head, CFO), each with a photo, role, name and a LinkedIn or profile link.
* The placement cell sees key people on **Recruiters**. Students see them on **Drives & Matching** (under "About the company") only after the placement cell has approved that recruiter.
* Links are blue, underlined and open in a new tab. Only plain http/https addresses are accepted, so `javascript:` and similar can never become a link.
* Photos must be JPG, PNG or WebP, up to 2 MB. The file's real bytes are checked (not its name), SVG is refused, and each photo is served only to people allowed to see it.

### Upgrading an existing database for this feature

It adds one optional column and two new tables. Nothing existing is changed.

```bash
pg_dump "$DATABASE_URL" > backup.sql        # back up first
npx prisma db execute --file prisma/upgrade/finals-updates.sql --schema prisma/schema.prisma
npx prisma generate
```

Safe to run twice. After this, do not run `prisma migrate dev` or `npm run db:reset` on that database.

## Menu and greeting

* Every portal has a three-line button at the top-left that closes and opens the left menu.
* Each Overview starts with "Good morning / afternoon / evening" (Indian time), then the name (company, student or college), then a short warm sentence that changes at every sign-in and always ends with "Welcome to C-Link."

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
* Not built yet: multi-factor login.

## Notifications

Students, recruiters and the TPO each get in-app notifications for the events that concern them (shortlists, interview times, offers, approvals, withdrawals, joining). The sidebar shows an unread badge. TPO notifications are shared by all TPO accounts at the college, a deliberate simplification for this single-college build.

## Notes

* Every save or action confirms with a toast notification.
* Eligibility rules and scheduling clash checks are plain TypeScript in `src/lib/rules.ts`. Gemma handles resume and job description understanding, fit explanations and readiness.
* This build is **single-college**: one shared roster, no separate data per college.
* "Specialization" is the term on screen. The database field is still called `branch`.
* Reset a user's password from the command line with `npm run reset-password`.
