-- ============================================
-- pgvector 改造：让 RAG 检索从 Node 内存计算下沉到 PostgreSQL
--
-- 背景：
--   旧方案 KnowledgeService.searchSimilar 把整个知识库 chunks (7912 条 × 1024 维)
--   全 findMany 到 Node，JSON.parse 后逐条算 cosine。
--   单次检索 ≥ 200MB Node heap，1.6G 小机器跑两次就爆。
--
-- 新方案：
--   1. 启用 pgvector 扩展
--   2. 在 KnowledgeDocChunkEntity 加 embeddingVec 列（vector(1024)）
--   3. 把现有 String embedding 全部回填到 vector 列
--   4. 建 HNSW 索引（cosine ops）→ 召回毫秒级、Node 内存 ≈ 0
--
-- 安全策略：
--   - 旧 embedding String 字段 不删除，作为回滚兜底
--   - 回填走 PG 内置 cast (text → vector)，不依赖应用层
--   - 索引建在 IF NOT EXISTS 前提，重跑 idempotent
-- ============================================

-- 1. 启用 pgvector 扩展（pgvector/pgvector:pg16 镜像已自带）
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 加 vector 列（nullable，老数据要回填后才有值）
ALTER TABLE "KnowledgeDocChunkEntity"
  ADD COLUMN IF NOT EXISTS "embeddingVec" vector(1024);

-- 3. 回填已有 chunk 的 embedding：String → vector
--    PG 自身支持 text::vector cast，不需要应用层介入
--    WHERE embeddingVec IS NULL 让 migration 可重跑
UPDATE "KnowledgeDocChunkEntity"
SET "embeddingVec" = embedding::vector(1024)
WHERE "embeddingVec" IS NULL
  AND embedding != '[]'
  AND embedding != '';

-- 4. 建 HNSW 索引（cosine 距离）
--    HNSW vs IVFFlat：
--      - HNSW 召回精度高、不需要 SET probes，运维友好
--      - 建索引慢一点但检索快、内存少
--    参数解释：
--      - m=16: 每个节点最多 16 个邻居（默认值，质量速度平衡）
--      - ef_construction=64: 构建时候选邻居数（默认值，越大质量越高越慢）
CREATE INDEX IF NOT EXISTS "idx_chunk_embedding_vec_cosine"
  ON "KnowledgeDocChunkEntity"
  USING hnsw ("embeddingVec" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
