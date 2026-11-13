-- C-Link text screening interview, steps 2-4: the student's attempt.
-- Purely additive and safe to run more than once: it adds one new table. No existing row is changed or removed.
-- Run screening-step1.sql first if you have not already.
--
-- Run:  npx prisma db execute --file prisma/upgrade/screening-step2.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "ScreeningAttempt" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
  "seed" INTEGER NOT NULL,
  "answers" JSONB NOT NULL,
  "mcqCorrect" INTEGER,
  "mcqTotal" INTEGER,
  "feedback" JSONB,
  "feedbackAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScreeningAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScreeningAttempt_applicationId_key" ON "ScreeningAttempt"("applicationId");

DO $$ BEGIN
  ALTER TABLE "ScreeningAttempt" ADD CONSTRAINT "ScreeningAttempt_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
