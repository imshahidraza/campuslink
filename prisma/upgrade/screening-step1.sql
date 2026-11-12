-- C-Link text screening interview, step 1: the questions of a drive.
-- Purely additive and safe to run more than once: it adds three columns to "Drive" and one new table.
-- No existing row is changed or removed.
--
-- Run:  npx prisma db execute --file prisma/upgrade/screening-step1.sql --schema prisma/schema.prisma

DO $$ BEGIN
  CREATE TYPE "ScreeningStatus" AS ENUM ('NONE', 'DRAFT', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "QuestionKind" AS ENUM ('MCQ', 'SHORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "screeningStatus" "ScreeningStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "screeningMinutes" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "screeningMinScore" INTEGER;

CREATE TABLE IF NOT EXISTS "ScreeningQuestion" (
  "id" TEXT NOT NULL,
  "driveId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "kind" "QuestionKind" NOT NULL,
  "prompt" TEXT NOT NULL,
  "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "correctIndex" INTEGER,
  "lookFor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScreeningQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScreeningQuestion_driveId_position_key" ON "ScreeningQuestion"("driveId", "position");

DO $$ BEGIN
  ALTER TABLE "ScreeningQuestion" ADD CONSTRAINT "ScreeningQuestion_driveId_fkey"
    FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
