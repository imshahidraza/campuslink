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

## Screening interview (text)

Every drive can have a short text interview: 4 to 5 multiple-choice questions and up to 2 written ones, the same for every student.

- **Recruiter:** on the drive page, the AI drafts the questions from the job description. The recruiter reads, edits or removes them, sets the time limit (5 to 60 minutes) and an optional minimum score, then approves. Published questions can't be changed.
- **Student:** after applying, the student takes it once on `/student/screening/<driveId>`. The order of questions and options is shuffled per student, the time limit is counted on the server, answers are saved as they go, and an attempt whose time runs out is submitted with what was saved.
- **Scoring:** the multiple-choice score is counted by code. The AI only writes short comments on the written answers, as advice for the recruiter. It never gives marks.
- **Shortlisting:** a recruiter can shortlist only a student who has finished the interview. The server enforces this.
- **Results:** the recruiter sees a sortable score (no rank numbers), a separate "Below your minimum" list (nobody is removed), and each student's answers. The placement cell sees only how many have finished.
- **Upgrading an existing database:** run `prisma/upgrade/screening-step1.sql` and then `prisma/upgrade/screening-step2.sql` with `npx prisma db execute --file <file> --schema prisma/schema.prisma`. Both only add things and are safe to run twice.

## Video interview (recorded, optional second round)

A drive can also have a recorded video interview: **5 spoken questions, 15 minutes in total, one continuous recording**. The recruiter chooses for each drive whether the screening is the text interview, the video interview, or both. Chrome or Edge on a desktop or laptop is needed (a phone or another browser is told to switch).

- **Recruiter:** on the drive page, the AI drafts 5 questions from the job description (or the recruiter writes them), edits them, and approves. Published questions can't be changed. Results are under **AI Interviews** in the menu.
- **Student:** reads the 12 rules, ticks the consent line, checks the camera and microphone, and presses Start. The recording starts first; if it can't start, nothing is counted as started. There is no per-question timer and no live countdown (one "less than a minute left" notice appears at the end). To answer, the student **presses and holds** the microphone button and lets go to finish (a very short touch is ignored). A question can be skipped for good after a confirmation (it scores 0 and never comes back). When the 15 minutes end, the recording stops and is submitted by the server's clock. The student sees "Assessment Submitted Successfully" and no marks.
- **Recording:** the browser sends the video to the server in small pieces while the interview runs, so a closed laptop loses only the last few seconds. The pieces are checked, joined and repaired (so the recruiter can seek), and stored **in PostgreSQL**. There is no public link to any recording.
- **Marks:** each answer is turned into text by Whisper on your own computer, then Gemma gives advice out of 100 (technical 40, relevance 25, completeness 20, clarity 15), total out of 500. The total is added up by code from the four parts. It is **advice only**: the AI never sees the face, and does not judge eye contact, looks, accent or background. A silent, very short or unreadable answer is **flagged for the recruiter to listen to, not given 0**. A skipped question gets 0.
- **Recruiter review:** a player (seek by clicking a question's time), the transcript, the four sub-scores with a one-line reason, and a flag for anything the AI could not mark. Buttons: **Process again**, **Delete recording**, **Let the student retake** (this deletes that attempt, including its access log).
- **Shortlisting:** a recruiter can shortlist only a student whose video interview has finished. The server enforces this.
- **Placement cell:** sees only how many students have finished. It can't open recordings.

### Setting it up

1. Back up, then add the new tables (run **after** the three `screening-step*.sql` files; safe to run twice):

   ```bash
   npx prisma db execute --file prisma/upgrade/video-interview.sql --schema prisma/schema.prisma
   npx prisma generate
   ```

   Do not run `prisma migrate dev` or `npm run db:reset` on a database that has real data.
2. Set up and start the speech service: see [`whisper-service/README.md`](whisper-service/README.md). Put `WHISPER_API_KEY` in `.env`.
3. Keep Ollama running, then `npm run dev`.

### Security on the recordings

- Only the **recruiter who owns the drive** (and is approved) can play a recording. Everyone else, including other recruiters, the placement cell and the student, gets "not found". The student never receives the recording or the marks.
- The video comes only from `/api/video/<attempt>/media`, which checks the session, the role and the ownership on every request (so every seek too), answers `Range` requests, and sends `Cache-Control: private, no-store`.
- Uploads accept only the student's own running attempt, WebM with the right file signature, at most 3 MiB a piece and 220 MiB in all, rate limited, and the same piece sent twice is stored once.
- Every answer, skip and finish is checked again on the server: the order, the time window against the recording clock, and that nothing is repeated.
- Consent time is stored. Every play, delete and retake by a recruiter is written to an access log.
- Recordings are **deleted after 30 days** (the marks and transcripts stay). A recruiter can delete one earlier.
- The speech service listens on `127.0.0.1` only and needs the secret key.

### Database size and speed: the trade-off

Putting the video in PostgreSQL keeps everything in one place (one backup, one set of access rules, no public file links), but it makes the database bigger.

- A 15-minute recording is about **60 MB** (video about 500 kbps and audio 48 kbps). 100 students is about 6 GB. After 30 days the video is deleted, so the size stays around "last 30 days of interviews".
- The video is stored in 1 MiB rows with `STORAGE EXTERNAL` (no compression, since video is already compressed), and played by reading only the rows the player asks for. Seeking does not load the whole file.
- `pg_dump` and backups include the recordings, so they get large. Delete old recordings or exclude the `VideoChunk` table from a quick backup.
- Free hosted databases (for example Neon's free plan) are only 0.5 GB, so they are **not** suitable for the video interview. The plan for the finals is to run on the laptop.
- If this ever grows beyond one college, the sensible next step is to move the pieces to object storage (S3-style) and keep only the details in PostgreSQL.

### Honest limits

- Transcription quality depends on the Whisper model (`small` by default), the microphone, and the room. It is checked here with a stub, not with real students' speech. Please judge it on your own laptop with a real recording before the finals.
- If a student closes the tab, loses power, or loses the network for good, the recording ends there. The attempt is saved as **Interrupted** with what reached the server and an honest note. A browser cannot keep recording after its tab is closed.
- A student who refreshes the page cannot continue the same recording. The re-opened page shows that the interview is running (or finished) and does not start a second one.
- Downloading is discouraged (no download button, no public link) but cannot be fully blocked: the recruiter's browser receives the video in order to play it.
- Chrome or Edge on desktop only. MFA is still not built.
- The AI marks are advice. A recruiter always decides.
