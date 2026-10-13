-- AlterTable: add password brute-force tracking columns to User
-- Both have defaults so existing rows are unaffected.
ALTER TABLE "User"
  ADD COLUMN "failedPasswordAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "passwordLockedUntil" TIMESTAMP(3);

