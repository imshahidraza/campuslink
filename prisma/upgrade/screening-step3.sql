-- C-Link text screening interview, step 3: counts how many times a student left the test page.
-- Purely additive and safe to run more than once: it adds one column. No existing row is changed or removed.
-- Run screening-step1.sql and screening-step2.sql first if you have not already.
--
-- Run:  npx prisma db execute --file prisma/upgrade/screening-step3.sql --schema prisma/schema.prisma

ALTER TABLE "ScreeningAttempt" ADD COLUMN IF NOT EXISTS "leaveCount" INTEGER NOT NULL DEFAULT 0;
