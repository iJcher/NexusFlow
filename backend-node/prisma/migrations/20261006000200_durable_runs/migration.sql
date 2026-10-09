-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "ownerUserId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "workspaceId" UUID NOT NULL,
    "userId" BIGINT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sourceFlowId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "graph" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "publishedBy" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "initiatorUserId" BIGINT NOT NULL,
    "input" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "cancelRequestedAt" TIMESTAMP(3),
    "highWaterSeq" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeRun" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "parentNodeId" TEXT,
    "itemId" TEXT,
    "itemIndex" INTEGER,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedInputs" JSONB,
    "output" JSONB,
    "errorCode" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "fencing" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "workerId" TEXT,
    "retryAt" TIMESTAMP(3),
    "dispatchGeneration" INTEGER NOT NULL DEFAULT 0,
    "lastDispatchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "NodeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeAttempt" (
    "id" UUID NOT NULL,
    "nodeRunId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "fencing" INTEGER NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "NodeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEdge" (
    "runId" UUID NOT NULL,
    "edgeId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unresolved',

    CONSTRAINT "RunEdge_pkey" PRIMARY KEY ("runId","edgeId")
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "runId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "nodeId" TEXT,
    "attemptId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("runId","seq")
);

-- CreateTable
CREATE TABLE "RunOutbox" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOperation" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "nodeRunId" UUID NOT NULL,
    "operationKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "errorCode" TEXT,
    "resolutionReason" TEXT,
    "resolvedBy" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_ownerUserId_key" ON "Workspace"("ownerUserId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE INDEX "WorkflowVersion_workspaceId_createdAt_idx" ON "WorkflowVersion"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_sourceFlowId_number_key" ON "WorkflowVersion"("sourceFlowId", "number");

-- CreateIndex
CREATE INDEX "FlowRun_workspaceId_createdAt_idx" ON "FlowRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FlowRun_status_createdAt_idx" ON "FlowRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NodeRun_runId_parentNodeId_status_idx" ON "NodeRun"("runId", "parentNodeId", "status");

-- CreateIndex
CREATE INDEX "NodeRun_status_leaseUntil_idx" ON "NodeRun"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "NodeRun_status_retryAt_idx" ON "NodeRun"("status", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "NodeRun_runId_nodeId_key" ON "NodeRun"("runId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeAttempt_nodeRunId_number_key" ON "NodeAttempt"("nodeRunId", "number");

-- CreateIndex
CREATE INDEX "RunOutbox_publishedAt_nextAttemptAt_idx" ON "RunOutbox"("publishedAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "RunOutbox_runId_nodeId_generation_key" ON "RunOutbox"("runId", "nodeId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOperation_operationKey_key" ON "ExternalOperation"("operationKey");

-- CreateIndex
CREATE INDEX "ExternalOperation_runId_status_idx" ON "ExternalOperation"("runId", "status");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_sourceFlowId_fkey" FOREIGN KEY ("sourceFlowId") REFERENCES "FlowEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeRun" ADD CONSTRAINT "NodeRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FlowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttempt" ADD CONSTRAINT "NodeAttempt_nodeRunId_fkey" FOREIGN KEY ("nodeRunId") REFERENCES "NodeRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEdge" ADD CONSTRAINT "RunEdge_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FlowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FlowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunOutbox" ADD CONSTRAINT "RunOutbox_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FlowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOperation" ADD CONSTRAINT "ExternalOperation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FlowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOperation" ADD CONSTRAINT "ExternalOperation_nodeRunId_fkey" FOREIGN KEY ("nodeRunId") REFERENCES "NodeRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Published definition is immutable even if an application accidentally calls update.
CREATE FUNCTION nf_immutable_workflow_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW."workspaceId", NEW."sourceFlowId", NEW.number, NEW."schemaVersion", NEW.graph, NEW.hash, NEW."publishedBy", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id, OLD."workspaceId", OLD."sourceFlowId", OLD.number, OLD."schemaVersion", OLD.graph, OLD.hash, OLD."publishedBy", OLD."createdAt") THEN
    RAISE EXCEPTION 'Published workflow definitions are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_workflow_version BEFORE UPDATE ON "WorkflowVersion"
FOR EACH ROW EXECUTE FUNCTION nf_immutable_workflow_version();
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT workspace_member_role CHECK (role IN ('Owner','Editor','Operator','Approver','Viewer'));

