CREATE TABLE "WorkspaceInvitation" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('Editor', 'Operator', 'Approver', 'Viewer')),
  "invitedBy" BIGINT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedBy" BIGINT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceInvitation_workspaceId_createdAt_idx" ON "WorkspaceInvitation"("workspaceId", "createdAt");
CREATE TABLE "WorkspaceAudit" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "actorUserId" BIGINT NOT NULL,
  "action" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "role" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceAudit_workspaceId_createdAt_idx" ON "WorkspaceAudit"("workspaceId", "createdAt");
