-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "FlowEntity" (
    "id" BIGINT NOT NULL,
    "ownerUserId" BIGINT,
    "displayName" TEXT NOT NULL DEFAULT '',
    "flowType" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "configInfoForRun" TEXT,
    "configInfoForWeb" TEXT,
    "lastModified" TIMESTAMP(3),
    "lastModifyBy" TEXT,

    CONSTRAINT "FlowEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowLLMProviderEntity" (
    "id" BIGINT NOT NULL,
    "ownerUserId" BIGINT,
    "platformName" TEXT NOT NULL,
    "llmNames" TEXT NOT NULL,
    "llmAPIUrl" TEXT NOT NULL,
    "llmAPIKey" TEXT NOT NULL,

    CONSTRAINT "FlowLLMProviderEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowChatConversationEntity" (
    "conversationId" TEXT NOT NULL,
    "ownerUserId" BIGINT,
    "user" TEXT NOT NULL,
    "flowId" BIGINT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "isTop" BOOLEAN NOT NULL DEFAULT false,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "variables" TEXT,

    CONSTRAINT "FlowChatConversationEntity_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "FlowChatMessageEntity" (
    "id" BIGINT NOT NULL,
    "ownerUserId" BIGINT,
    "user" TEXT NOT NULL,
    "flowId" BIGINT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "flowInstanceId" BIGINT NOT NULL,
    "question" TEXT NOT NULL DEFAULT '',
    "answer" TEXT NOT NULL DEFAULT '',
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "files" TEXT,

    CONSTRAINT "FlowChatMessageEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEntity" (
    "id" BIGINT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "nickName" TEXT NOT NULL,
    "lastLoginIp" TEXT NOT NULL DEFAULT '',
    "lastLoginTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registerTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isEnable" BOOLEAN DEFAULT true,
    "lockoutEndDateUtc" TIMESTAMP(3),
    "lockoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "accessFailedCount" INTEGER DEFAULT 0,
    "role" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowTemplateEntity" (
    "id" BIGINT NOT NULL,
    "ownerUserId" BIGINT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "flowType" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "configInfoForRun" TEXT,
    "configInfoForWeb" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowTemplateEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseEntity" (
    "id" BIGINT NOT NULL,
    "ownerUserId" BIGINT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "docCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "embeddingModel" TEXT NOT NULL DEFAULT '',
    "chunkSize" INTEGER NOT NULL DEFAULT 500,
    "chunkOverlap" INTEGER NOT NULL DEFAULT 50,
    "chunkStrategy" TEXT NOT NULL DEFAULT 'paragraph',

    CONSTRAINT "KnowledgeBaseEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocumentEntity" (
    "id" BIGINT NOT NULL,
    "knowledgeBaseId" BIGINT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "fileType" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeDocumentEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocChunkEntity" (
    "id" BIGINT NOT NULL,
    "documentId" BIGINT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL DEFAULT '',
    "embedding" TEXT NOT NULL DEFAULT '[]',
    "tokenCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KnowledgeDocChunkEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillEntity" (
    "id" BIGINT NOT NULL,
    "ownerUserId" BIGINT NOT NULL,
    "flowId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "inputSchema" TEXT NOT NULL DEFAULT '{}',
    "outputSchema" TEXT NOT NULL DEFAULT '{}',
    "workflowSnapshot" TEXT NOT NULL,
    "filesJson" TEXT NOT NULL DEFAULT '{}',
    "generationPrompt" TEXT NOT NULL DEFAULT '',
    "modelName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'generated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpServerEntity" (
    "id" BIGINT NOT NULL,
    "ownerUserId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'sse',
    "endpoint" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL DEFAULT '',
    "args" TEXT NOT NULL DEFAULT '[]',
    "env" TEXT NOT NULL DEFAULT '{}',
    "headers" TEXT NOT NULL DEFAULT '{}',
    "toolsJson" TEXT NOT NULL DEFAULT '[]',
    "lastSyncAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpServerEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlowEntity_ownerUserId_idx" ON "FlowEntity"("ownerUserId");

-- CreateIndex
CREATE INDEX "FlowEntity_flowType_idx" ON "FlowEntity"("flowType");

-- CreateIndex
CREATE INDEX "FlowLLMProviderEntity_ownerUserId_idx" ON "FlowLLMProviderEntity"("ownerUserId");

-- CreateIndex
CREATE INDEX "FlowChatConversationEntity_ownerUserId_flowId_updatedAt_idx" ON "FlowChatConversationEntity"("ownerUserId", "flowId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlowChatConversationEntity_conversationId_user_key" ON "FlowChatConversationEntity"("conversationId", "user");

-- CreateIndex
CREATE INDEX "FlowChatMessageEntity_ownerUserId_flowId_conversationId_cre_idx" ON "FlowChatMessageEntity"("ownerUserId", "flowId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "FlowChatMessageEntity_user_conversationId_createdAt_idx" ON "FlowChatMessageEntity"("user", "conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserEntity_phoneNumber_key" ON "UserEntity"("phoneNumber");

-- CreateIndex
CREATE INDEX "FlowTemplateEntity_ownerUserId_idx" ON "FlowTemplateEntity"("ownerUserId");

-- CreateIndex
CREATE INDEX "FlowTemplateEntity_flowType_idx" ON "FlowTemplateEntity"("flowType");

-- CreateIndex
CREATE INDEX "FlowTemplateEntity_category_idx" ON "FlowTemplateEntity"("category");

-- CreateIndex
CREATE INDEX "FlowTemplateEntity_isOfficial_idx" ON "FlowTemplateEntity"("isOfficial");

-- CreateIndex
CREATE INDEX "KnowledgeBaseEntity_ownerUserId_idx" ON "KnowledgeBaseEntity"("ownerUserId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseEntity_createdBy_idx" ON "KnowledgeBaseEntity"("createdBy");

-- CreateIndex
CREATE INDEX "KnowledgeDocumentEntity_knowledgeBaseId_idx" ON "KnowledgeDocumentEntity"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "KnowledgeDocChunkEntity_documentId_idx" ON "KnowledgeDocChunkEntity"("documentId");

-- CreateIndex
CREATE INDEX "SkillEntity_ownerUserId_idx" ON "SkillEntity"("ownerUserId");

-- CreateIndex
CREATE INDEX "SkillEntity_flowId_idx" ON "SkillEntity"("flowId");

-- CreateIndex
CREATE INDEX "McpServerEntity_ownerUserId_idx" ON "McpServerEntity"("ownerUserId");

-- AddForeignKey
ALTER TABLE "KnowledgeDocumentEntity" ADD CONSTRAINT "KnowledgeDocumentEntity_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBaseEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocChunkEntity" ADD CONSTRAINT "KnowledgeDocChunkEntity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocumentEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

