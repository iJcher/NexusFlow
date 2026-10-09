ALTER TABLE "UserEntity"
  ALTER COLUMN "phoneNumber" DROP NOT NULL,
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ALTER COLUMN "passwordSalt" DROP NOT NULL,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "UserEntity_email_key" ON "UserEntity"("email");

CREATE TABLE "EmailLoginChallenge" (
  "id" UUID PRIMARY KEY,
  "email" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'login',
  "codeHash" TEXT NOT NULL,
  "sendState" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailLoginChallenge_email_createdAt_idx" ON "EmailLoginChallenge"("email", "createdAt");
CREATE INDEX "EmailLoginChallenge_expiresAt_idx" ON "EmailLoginChallenge"("expiresAt");
CREATE TABLE "AuthEmailState" (
  "email" TEXT PRIMARY KEY,
  "activeChallengeId" UUID,
  "pendingChallengeId" UUID,
  "lastRequestedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AuthSession" (
  "id" UUID PRIMARY KEY,
  "userId" BIGINT NOT NULL REFERENCES "UserEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "familyId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_familyId_idx" ON "AuthSession"("familyId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
