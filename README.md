# CampusLink

AI-powered campus-to-corporate placement platform. Next.js + Tailwind + PostgreSQL (Prisma) + a **local** Ollama model (`gemma4:e4b`) for every AI feature. Fully responsive — works on desktop and phones (portrait).

## Run it

```bash
npm install
# .env -> set DATABASE_URL to your Postgres login (createdb campuslink first)
npm run db:generate
npm run db:migrate
npm run dev          # http://localhost:3000
```
Keep `ollama serve` running (model: `gemma4:e4b`).

## Schema changed in this version — reset recommended

The offer pipeline was restructured (new stages, removed the old `offerStatus` field, two new notification tables). If you have existing test data:
```bash
npx prisma migrate reset --force
npm run db:generate
npm run db:migrate
```

## The offer pipeline (new)

Offers now originate with the **recruiter**, not the TPO:

1. Recruiter marks a candidate **Selected** (on the TPO's drive page, after interviews).
2. Recruiter clicks **Request Offer** and names a package — this is fixed once sent; the TPO can't edit it, only forward or hold it.
3. TPO reviews it on **Offers → Awaiting your review** and clicks **Send to student**.
4. Student sees **Accept / Decline** on their Placement Journey. Declining only affects that one application — they stay fully active on every other drive.
5. Whichever way they respond, the **recruiter and the TPO both get notified automatically**.
6. If accepted: TPO clicks **Verify documents**, then **Mark joined** — matching the full pipeline: Selected → Offer Requested → Offer Sent → Accepted (Placed) → Documents Verified → Joined.

## Notifications — now for all three roles

- **Student**: drive announcements, shortlists, interviews, offers (existing).
- **Recruiter** (new): TPO-recommended candidates (Special Consideration), and the student's accept/decline on their offers.
- **TPO** (new): offer requests awaiting review, and student responses. Broadcast to all TPO accounts at the college (single shared read-state — a deliberate simplification for this single-college build).

Each sidebar shows an unread-count badge on the Notifications item, and on mobile, a dot on the menu icon.

## Mobile

The sidebar collapses into a slide-out drawer below the `md` breakpoint (hamburger menu, top bar). Forms, tables, and page headers reflow to single-column on narrow screens. Tested down to standard phone widths in portrait.

## Terminology

"Specialization" is used everywhere in the UI (previously some screens said "Branch"). The underlying database field is still named `branch` internally — that's not user-facing, so no migration risk from this change alone.
