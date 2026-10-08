-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "specialConsideration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specialConsiderationNote" TEXT;
