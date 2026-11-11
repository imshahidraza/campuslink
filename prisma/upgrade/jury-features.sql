-- C-Link "jury features" upgrade.
--
-- ADDITIVE ONLY: it adds three enum types, new columns and one new table.
-- It does not drop, rename or change anything that exists, and it does not touch a single row.
-- Old offers keep their text package and simply show as "Full-time" (the column default).
-- Safe to run more than once. The older (finals) build keeps working on a database that has had
-- this applied, because it just ignores the extra columns.
--
-- Run it with:  npx prisma db execute --file prisma/upgrade/jury-features.sql --schema prisma/schema.prisma

DO $$ BEGIN CREATE TYPE "OfferType" AS ENUM ('INTERNSHIP', 'PPO', 'FULL_TIME'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DeferralStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Offer details, deferral and reminders
ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "offerType" "OfferType" NOT NULL DEFAULT 'FULL_TIME',
  ADD COLUMN IF NOT EXISTS "offerCtcLpa" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "offerStipend" INTEGER,
  ADD COLUMN IF NOT EXISTS "bondMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "bondNote" TEXT,
  ADD COLUMN IF NOT EXISTS "joiningDate" DATE,
  ADD COLUMN IF NOT EXISTS "convertedFromInternship" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deferralStatus" "DeferralStatus",
  ADD COLUMN IF NOT EXISTS "deferralReason" TEXT,
  ADD COLUMN IF NOT EXISTS "deferralRequestedDate" DATE,
  ADD COLUMN IF NOT EXISTS "deferralRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deferralDecidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deferralNote" TEXT,
  ADD COLUMN IF NOT EXISTS "previousJoiningDate" DATE,
  ADD COLUMN IF NOT EXISTS "documentsDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "docReminderSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "docOverdueSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "offerFollowUpAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "offerFollowUpCount" INTEGER NOT NULL DEFAULT 0;

-- Drive announcements
ALTER TABLE "Drive"
  ADD COLUMN IF NOT EXISTS "announcedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "announcedCount" INTEGER;

-- Support list for students at risk of finishing the season unplaced
CREATE TABLE IF NOT EXISTS "Escalation" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
  "mentorName" TEXT,
  "note" TEXT,
  "assignedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Escalation_studentId_key" ON "Escalation"("studentId");
CREATE INDEX IF NOT EXISTS "Escalation_status_idx" ON "Escalation"("status");
DO $$ BEGIN
  ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
