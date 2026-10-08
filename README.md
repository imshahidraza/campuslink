# CampusLink

AI-powered campus-to-corporate placement platform. Next.js + Tailwind + PostgreSQL (Prisma) + a **local** Ollama model (`gemma4:e4b`) for every AI feature.

## Run it

```bash
npm install
# .env -> set DATABASE_URL to your Postgres login (createdb campuslink first)
npm run db:generate
npm run db:migrate
npm run dev          # http://localhost:3000
```
Keep `ollama serve` running (model: `gemma4:e4b`).

## Start from a clean slate

```bash
npx prisma migrate reset --force   # wipes ALL data
npm run db:generate
npm run db:migrate
```
Sign out and back in afterward — an old login cookie pointing at deleted data now redirects you to `/login` cleanly instead of crashing, but it still won't have anything to show until you sign in fresh.

## How accounts and data work

- **TPO**: the first to register names the college (+ optional email domain, e.g. `mycollege.edu`, used to verify students at signup). Every TPO after that just joins automatically.
- **Programs are free text**, not a locked list — B.Tech, MCA, MBA are shown as suggestions, but a TPO can type anything. Spelling/casing is reconciled automatically (the first time a program is typed, that spelling becomes canonical; later near-matches like "b.tech" reuse it).
- **Students don't type their own academic data.** The TPO imports them first:
  - **TPO → Students → Add students** — paste rows from a spreadsheet, type them, or **import a .csv file** directly. Columns can be in *any order* as long as the first row has recognizable headers (Roll No, Name, Program, Specialization, CGPA, Backlogs, Graduation Year — common synonyms like "Branch", "GPA", "Batch" are recognized too). No header row? Falls back to that fixed order.
  - A student then signs up with just **name, email, password, and roll number** — everything else is pulled from the TPO's import and becomes read-only on their profile.
- **Assessment scores (aptitude/reasoning/verbal/communication)** are a separate import: **TPO → Students → Assessment scores**, same flexible paste/CSV format, matched by roll number. These feed directly into each student's AI readiness analysis — without this step, readiness analysis runs with those fields blank.
- **Recruiters** self-register with a company name.

## First-time flow

1. TPO signs up (names the college) → **Students → Add students** (paste or CSV) → optionally **Assessment scores**.
2. Students sign up with their roll number.
3. Recruiter signs up, posts a drive (JD gets AI-parsed), sets it to **Open**.
4. TPO opens the drive → **Run AI matching** → shortlist, schedule, offer.

## Notes

- Every Save/action across the app now confirms with a toast notification (bottom-right) instead of relying on a page re-render to tell you something happened.
- Eligibility rules (CGPA / backlogs / branch / grad year) and scheduling conflicts are plain TypeScript in `src/lib/rules.ts`; Gemma handles resume/JD understanding, matching, explanations and readiness.
- This build is single-college — one shared roster/catalog, no multi-tenant isolation.
