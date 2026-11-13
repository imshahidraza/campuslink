-- C-Link recorded video interview: new tables and columns.
-- Purely additive and safe to run more than once: it adds four enum types, two columns and six new tables.
-- No existing row is changed or removed. Run screening-step1.sql, screening-step2.sql and screening-step3.sql first.
--
-- Run:  npx prisma db execute --file prisma/upgrade/video-interview.sql --schema prisma/schema.prisma

DO $$ BEGIN CREATE TYPE "VideoAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT', 'INTERRUPTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VideoAnswerStatus" AS ENUM ('PENDING', 'ANSWERED', 'SKIPPED', 'UNANSWERED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VideoStepStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VideoChunkKind" AS ENUM ('RAW', 'FINAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "videoStatus" "ScreeningStatus" NOT NULL DEFAULT 'NONE';

CREATE TABLE IF NOT EXISTS "VideoQuestion" (
  "id" TEXT NOT NULL,
  "driveId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "prompt" TEXT NOT NULL,
  "expected" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoQuestion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VideoQuestion_driveId_position_key" ON "VideoQuestion"("driveId", "position");

CREATE TABLE IF NOT EXISTS "VideoAttempt" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "status" "VideoAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "consentAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT,
  "mimeType" TEXT NOT NULL,
  "leaveCount" INTEGER NOT NULL DEFAULT 0,
  "lastChunkAt" TIMESTAMP(3),
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "byteSize" INTEGER NOT NULL DEFAULT 0,
  "durationSec" DOUBLE PRECISION,
  "gapNote" TEXT,
  "remuxStatus" "VideoStepStatus" NOT NULL DEFAULT 'PENDING',
  "transcriptionStatus" "VideoStepStatus" NOT NULL DEFAULT 'PENDING',
  "evaluationStatus" "VideoStepStatus" NOT NULL DEFAULT 'PENDING',
  "processingStartedAt" TIMESTAMP(3),
  "processNote" TEXT,
  "totalScore" INTEGER,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "retainUntil" TIMESTAMP(3),
  "recordingDeletedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VideoAttempt_applicationId_key" ON "VideoAttempt"("applicationId");
CREATE INDEX IF NOT EXISTS "VideoAttempt_status_deadlineAt_idx" ON "VideoAttempt"("status", "deadlineAt");

CREATE TABLE IF NOT EXISTS "VideoAnswer" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "prompt" TEXT NOT NULL,
  "expected" TEXT,
  "status" "VideoAnswerStatus" NOT NULL DEFAULT 'PENDING',
  "startSec" DOUBLE PRECISION,
  "endSec" DOUBLE PRECISION,
  "transcript" TEXT,
  "transcriptStatus" "VideoStepStatus" NOT NULL DEFAULT 'PENDING',
  "evalStatus" "VideoStepStatus" NOT NULL DEFAULT 'PENDING',
  "score" INTEGER,
  "technical" INTEGER,
  "relevance" INTEGER,
  "completeness" INTEGER,
  "clarity" INTEGER,
  "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "improvements" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "feedback" TEXT,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  CONSTRAINT "VideoAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VideoAnswer_attemptId_position_key" ON "VideoAnswer"("attemptId", "position");

CREATE TABLE IF NOT EXISTS "VideoChunk" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "kind" "VideoChunkKind" NOT NULL,
  "seq" INTEGER NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoChunk_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VideoChunk_attemptId_kind_seq_key" ON "VideoChunk"("attemptId", "kind", "seq");
-- Video is already compressed, so PostgreSQL should not try to compress it again. Stored out of line and
-- uncompressed, a slice of a piece can be read without reading the whole piece.
ALTER TABLE "VideoChunk" ALTER COLUMN "data" SET STORAGE EXTERNAL;

CREATE TABLE IF NOT EXISTS "VideoAccessLog" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoAccessLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VideoAccessLog_attemptId_createdAt_idx" ON "VideoAccessLog"("attemptId", "createdAt");

DO $$ BEGIN ALTER TABLE "VideoQuestion" ADD CONSTRAINT "VideoQuestion_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "VideoAttempt" ADD CONSTRAINT "VideoAttempt_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "VideoAnswer" ADD CONSTRAINT "VideoAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "VideoAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "VideoChunk" ADD CONSTRAINT "VideoChunk_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "VideoAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "VideoAccessLog" ADD CONSTRAINT "VideoAccessLog_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "VideoAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
