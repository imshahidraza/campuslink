-- C-Link finals update: recruiter "Profile setup" and "Key People".
-- Purely additive and safe to run more than once: it adds one optional column and two new tables.
-- No existing row is changed or removed.
--
-- Run:  npx prisma db execute --file prisma/upgrade/finals-updates.sql --schema prisma/schema.prisma

ALTER TABLE "Recruiter" ADD COLUMN IF NOT EXISTS "contactRole" TEXT;

CREATE TABLE IF NOT EXISTS "KeyPerson" (
  "id" TEXT NOT NULL,
  "recruiterId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "profileUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KeyPerson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KeyPersonPhoto" (
  "id" TEXT NOT NULL,
  "keyPersonId" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KeyPersonPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KeyPerson_recruiterId_position_key" ON "KeyPerson"("recruiterId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "KeyPersonPhoto_keyPersonId_key" ON "KeyPersonPhoto"("keyPersonId");

DO $$ BEGIN
  ALTER TABLE "KeyPerson" ADD CONSTRAINT "KeyPerson_recruiterId_fkey"
    FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "KeyPersonPhoto" ADD CONSTRAINT "KeyPersonPhoto_keyPersonId_fkey"
    FOREIGN KEY ("keyPersonId") REFERENCES "KeyPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
