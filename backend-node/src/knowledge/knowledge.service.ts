import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { RerankService } from './rerank.service';
import { LlmProviderService } from '../llm-provider/llm-provider.service';
import { nextId } from '../common/snowflake';
import * as path from 'path';

/** RAG 二阶段检索：召回阶段一次取这么多倍 topK 当候选喂给 rerank */
const RERANK_CANDIDATE_MULTIPLIER = 6;
/** 召回候选硬上限，避免极端情况下把 rerank API 打爆 */
const RERANK_CANDIDATE_MAX = 60;

export const EMBEDDING_SYSTEM_DEFAULT_KEY = 'system-default';

export interface AvailableEmbeddingModelOption {
  /** 唯一 key，前端下拉用 */
  key: string;
  /** 实际提交给 createKnowledgeBase 的 model name */
  modelName: string;
  /** UI 显示名 */
  displayLabel: string;
  /** 是否系统级默认（仅做视觉标识用） */
  isSystemDefault: boolean;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
    private chunkingService: ChunkingService,
    private llmProviderService: LlmProviderService,
    private rerankService: RerankService,
  ) {}

  // ==================== 模型选项 ====================

  /**
   * 给知识库创建/编辑表单的 embedding 下拉用。
   *
   * 顺序：
   *   1. 系统级默认（运维在 .env 配的 RAG_DEFAULT_EMBEDDING_*）
   *   2. 用户在「模型」页配过的 LLM Provider 里，llmNames 包含 'embedding' 关键字的模型
   *
   * 与 SkillService.getAvailableModels 同样的设计模式，保持架构一致。
   */
  async getAvailableEmbeddingModels(userId: string): Promise<AvailableEmbeddingModelOption[]> {
    const options: AvailableEmbeddingModelOption[] = [];

    const systemDefault = this.llmProviderService.getDefaultEmbeddingProvider();
    if (systemDefault) {
      options.push({
        key: EMBEDDING_SYSTEM_DEFAULT_KEY,
        modelName: systemDefault.modelName,
        displayLabel: systemDefault.modelName,
        isSystemDefault: true,
      });
    }

    const userProviders = await this.llmProviderService.getList(undefined, userId);
    const seen = new Set<string>();
    for (const provider of userProviders) {
      const llmNames: string[] = (provider as any).llmNames || [];
      for (const name of llmNames) {
        if (!name.toLowerCase().includes('embedding')) continue;
        const key = `user:${provider.id}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({
          key,
          modelName: name,
          displayLabel: `${provider.platformName} - ${name}`,
          isSystemDefault: false,
        });
      }
    }

    return options;
  }

  // ==================== 知识库 CRUD ====================

  async createKnowledgeBase(
    dto: { name: string; description?: string; embeddingModel?: string; chunkSize?: number; chunkOverlap?: number; chunkStrategy?: string },
    userId: string,
    userName: string,
  ) {
    const entity = await this.prisma.knowledgeBaseEntity.create({
      data: {
        id: nextId(),
        ownerUserId: BigInt(userId),
        name: dto.name,
        description: dto.description || '',
        embeddingModel: dto.embeddingModel || '',
        chunkSize: dto.chunkSize || 500,
        chunkOverlap: dto.chunkOverlap || 50,
        chunkStrategy: dto.chunkStrategy || 'paragraph',
        createdBy: userName,
      },
    });
    return this.toKbDto(entity);
  }

  async getKnowledgeBaseById(id: bigint, userId: string) {
    const entity = await this.prisma.knowledgeBaseEntity.findUnique({
      where: { id },
      include: { documents: { orderBy: { createdAt: 'desc' } } },
    });
    if (!entity || entity.ownerUserId !== BigInt(userId)) return null;
    return {
      ...this.toKbDto(entity),
      documents: entity.documents.map((d) => this.toDocDto(d)),
    };
  }

  async getKnowledgeBaseList(
    params: { keyword?: string; pageIndex?: number; pageSize?: number },
    userId: string,
  ) {
    const { keyword, pageIndex = 1, pageSize = 20 } = params;
    const where: any = { ownerUserId: BigInt(userId) };
    if (keyword) {
      where.OR = [{ name: { contains: keyword } }, { description: { contains: keyword } }];
    }

    const [total, entities] = await Promise.all([
      this.prisma.knowledgeBaseEntity.count({ where }),
      this.prisma.knowledgeBaseEntity.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (pageIndex - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, items: entities.map((e) => this.toKbDto(e)) };
  }

  async updateKnowledgeBase(
    id: bigint,
    dto: { name?: string; description?: string; embeddingModel?: string; chunkSize?: number; chunkOverlap?: number; chunkStrategy?: string },
    userId: string,
  ) {
    const entity = await this.prisma.knowledgeBaseEntity.findFirst({
      where: { id, ownerUserId: BigInt(userId) },
    });
    if (!entity) return null;

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.embeddingModel !== undefined) updateData.embeddingModel = dto.embeddingModel;
    if (dto.chunkSize !== undefined) updateData.chunkSize = dto.chunkSize;
    if (dto.chunkOverlap !== undefined) updateData.chunkOverlap = dto.chunkOverlap;
    if (dto.chunkStrategy !== undefined) updateData.chunkStrategy = dto.chunkStrategy;

    const updated = await this.prisma.knowledgeBaseEntity.update({
      where: { id },
      data: updateData,
    });
    return this.toKbDto(updated);
  }

  async deleteKnowledgeBase(id: bigint, userId: string) {
    const result = await this.prisma.knowledgeBaseEntity.deleteMany({
      where: { id, ownerUserId: BigInt(userId) },
    });
    return result.count > 0;
  }

  // ==================== 文档管理 ====================

  async uploadDocument(
    knowledgeBaseId: bigint,
    file: Express.Multer.File,
    userId: string,
    options: { chunkSize?: number; chunkOverlap?: number; embeddingModel?: string } = {},
  ) {
    const kb = await this.prisma.knowledgeBaseEntity.findFirst({
      where: { id: knowledgeBaseId, ownerUserId: BigInt(userId) },
    });
    if (!kb) throw new Error('Knowledge base not found');

    const embeddingModel = options.embeddingModel || kb.embeddingModel || '';
    const chunkSize = options.chunkSize || kb.chunkSize || 500;
    const chunkOverlap = options.chunkOverlap || kb.chunkOverlap || 50;
    const chunkStrategy = (kb.chunkStrategy || 'paragraph') as 'fixed' | 'paragraph' | 'markdown';

    const fileName = this.fixMulterFileName(file.originalname);
    const fileType = path.extname(fileName).toLowerCase();
    const docId = nextId();

    const doc = await this.prisma.knowledgeDocumentEntity.create({
      data: {
        id: docId,
        knowledgeBaseId,
        fileName,
        fileSize: file.size,
        fileType,
        status: 'processing',
      },
    });

    this.processDocument(docId, knowledgeBaseId, file.buffer, fileType, {
      ...options,
      embeddingModel,
      chunkSize,
      chunkOverlap,
      chunkStrategy,
      ownerUserId: userId,
    }).catch((e) => {
      this.logger.error(`Document processing failed: ${e.message}`);
    });

    return this.toDocDto(doc);
  }

  private async processDocument(
    docId: bigint,
    knowledgeBaseId: bigint,
    buffer: Buffer,
    fileType: string,
    options: {
      chunkSize?: number;
      chunkOverlap?: number;
      chunkStrategy?: 'fixed' | 'paragraph' | 'markdown';
      embeddingModel?: string;
      ownerUserId?: string;
    },
  ) {
    try {
      const text = await this.chunkingService.extractText(buffer, fileType);
      if (!text.trim()) {
        await this.prisma.knowledgeDocumentEntity.update({
          where: { id: docId },
          data: { status: 'error', errorMsg: 'Empty document content' },
        });
        return;
      }

      await this.prisma.knowledgeDocumentEntity.update({
        where: { id: docId },
        data: { content: text },
      });

      const chunks = this.chunkingService.chunkText(text, {
        chunkSize: options.chunkSize || 500,
        chunkOverlap: options.chunkOverlap || 50,
        strategy: options.chunkStrategy || 'paragraph',
      });

      if (chunks.length === 0) {
        await this.prisma.knowledgeDocumentEntity.update({
          where: { id: docId },
          data: { status: 'error', errorMsg: 'No chunks generated' },
        });
        return;
      }

      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const embeddings = await this.embeddingService.getEmbeddings(
          batch.map((c) => c.content),
          options.embeddingModel,
          options.ownerUserId,
        );

        const chunkData = batch.map((chunk, idx) => ({
          id: nextId(),
          documentId: docId,
          chunkIndex: chunk.index,
          content: chunk.content,
          embedding: JSON.stringify(embeddings[idx] || []),
          tokenCount: chunk.tokenCount,
        }));

        await this.prisma.knowledgeDocChunkEntity.createMany({ data: chunkData });

        // 双写 pgvector：createMany 不能直接写 Unsupported("vector(1024)") 字段
        // 走 PG 自身的 text → vector cast，0 网络传输、0 应用层解析
        // 失败不影响主流程（旧 String embedding 已经写好，可走兜底路径）
        const ids = chunkData.map((c) => c.id);
        try {
          await this.prisma.$executeRawUnsafe(
            `UPDATE "KnowledgeDocChunkEntity"
             SET "embeddingVec" = embedding::vector(1024)
             WHERE id = ANY($1::bigint[]) AND "embeddingVec" IS NULL`,
            ids,
          );
        } catch (e: any) {
          this.logger.warn(`embeddingVec backfill failed for batch (will fallback at search time): ${e.message}`);
        }
      }

      await this.prisma.knowledgeDocumentEntity.update({
        where: { id: docId },
        data: { chunkCount: chunks.length, status: 'completed' },
      });

      await this.updateKbStats(knowledgeBaseId);
      this.logger.log(`Document processed: ${docId}, ${chunks.length} chunks`);
    } catch (e: any) {
      this.logger.error(`Process document error: ${e.message}`, e.stack);
      await this.prisma.knowledgeDocumentEntity.update({
        where: { id: docId },
        data: { status: 'error', errorMsg: e.message },
      });
    }
  }

  async getDocumentChunks(documentId: bigint, userId: string) {
    return this.prisma.knowledgeDocChunkEntity.findMany({
      where: {
        documentId,
        document: { knowledgeBase: { ownerUserId: BigInt(userId) } },
      },
      orderBy: { chunkIndex: 'asc' },
      select: { id: true, chunkIndex: true, content: true, tokenCount: true },
    });
  }

  async deleteDocument(documentId: bigint, userId: string) {
    const doc = await this.prisma.knowledgeDocumentEntity.findUnique({
      where: { id: documentId },
      include: { knowledgeBase: { select: { ownerUserId: true } } },
    });
    if (!doc || doc.knowledgeBase.ownerUserId !== BigInt(userId)) return false;

    await this.prisma.knowledgeDocumentEntity.delete({ where: { id: documentId } });
    await this.updateKbStats(doc.knowledgeBaseId);
    return true;
  }

  // ==================== RAG 核心：语义检索 ====================

  async searchSimilar(
    knowledgeBaseId: bigint,
    query: string,
    userId: string,
    options: {
      topK?: number;
      threshold?: number;
      embeddingModel?: string;
      /** 是否启用重排，默认 true（系统未配置 rerank provider 时自动降级为单阶段） */
      rerankEnabled?: boolean;
    } = {},
  ) {
    const { topK = 5, threshold = 0.3, rerankEnabled = true } = options;
    const ownerId = BigInt(userId);

    let embeddingModel = options.embeddingModel;
    if (!embeddingModel) {
      const kb = await this.prisma.knowledgeBaseEntity.findFirst({
        where: { id: knowledgeBaseId, ownerUserId: ownerId },
        select: { embeddingModel: true },
      });
      if (!kb) return [];
      embeddingModel = kb?.embeddingModel || undefined;
    } else {
      const kb = await this.prisma.knowledgeBaseEntity.findFirst({
        where: { id: knowledgeBaseId, ownerUserId: ownerId },
        select: { id: true },
      });
      if (!kb) return [];
    }

    // ===== 第一阶段：召回（pgvector SQL 算 cosine） =====
    // 旧方案：findMany 全表 → JSON.parse → JS 循环算 cosine（7912 chunk × 1024 维 ≈ 200MB Node heap）
    // 新方案：SQL 走 pgvector HNSW 索引，1 - (a <=> b) 是 cosine 相似度，毫秒级 + Node 内存 ≈ 0
    // 不走 rerank 时直接取 topK
    const candidateK = rerankEnabled
      ? Math.min(topK * RERANK_CANDIDATE_MULTIPLIER, RERANK_CANDIDATE_MAX)
      : topK;

    const queryEmbedding = await this.embeddingService.getEmbedding(
      query,
      embeddingModel || undefined,
      userId,
    );

    // pgvector 接受字面量字符串作为输入，PG 内部会 cast 成 vector
    const queryVecLiteral = `[${queryEmbedding.join(',')}]`;

    const recallRaw = await this.prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        documentId: bigint;
        chunkIndex: number;
        content: string;
        fileName: string;
        similarity: number;
      }>
    >(
      `SELECT
         c.id,
         c."documentId",
         c."chunkIndex",
         c.content,
         d."fileName",
         1 - (c."embeddingVec" <=> $1::vector) AS similarity
       FROM "KnowledgeDocChunkEntity" c
       INNER JOIN "KnowledgeDocumentEntity" d ON c."documentId" = d.id
       INNER JOIN "KnowledgeBaseEntity" kb ON d."knowledgeBaseId" = kb.id
       WHERE d."knowledgeBaseId" = $2::bigint
         AND kb."ownerUserId" = $3::bigint
         AND c."embeddingVec" IS NOT NULL
         AND 1 - (c."embeddingVec" <=> $1::vector) >= $4::float
       ORDER BY c."embeddingVec" <=> $1::vector ASC
       LIMIT $5::int`,
      queryVecLiteral,
      knowledgeBaseId,
      ownerId,
      threshold,
      candidateK,
    );

    const recall = recallRaw.map((r) => ({
      chunkId: r.id.toString(),
      documentId: r.documentId.toString(),
      fileName: r.fileName,
      source: `${r.fileName}#chunk-${r.chunkIndex}`,
      content: r.content,
      chunkIndex: r.chunkIndex,
      similarity: Number(r.similarity),
    }));

    if (!rerankEnabled || recall.length <= 1) return recall.slice(0, topK);

    // ===== 第二阶段：重排 =====
    // 把候选 chunk 的 content 喂给 cross-encoder 重排模型，得到更精准的 Top-K
    const rerankItems = await this.rerankService.rerank(
      query,
      recall.map((r) => r.content),
      topK,
    );

    return rerankItems.map((item) => ({
      ...recall[item.index],
      // similarity 字段被替换成 rerank 分数；语义都是"越大越相关"，对外接口保持一致
      similarity: item.score,
    }));
  }

  /**
   * 多知识库检索 — 供 KnowledgeNode 使用
   */
  async searchMultiple(
    knowledgeBaseIds: bigint[],
    query: string,
    userId: string,
    options: { topK?: number; threshold?: number; embeddingModel?: string } = {},
  ) {
    const ownerId = BigInt(userId);
    const targetKnowledgeBaseIds = knowledgeBaseIds.length
      ? knowledgeBaseIds
      : (
          await this.prisma.knowledgeBaseEntity.findMany({
            where: {
              ownerUserId: ownerId,
              status: 'active',
              chunkCount: { gt: 0 },
            },
            select: { id: true },
          })
        ).map((kb) => kb.id);

    if (targetKnowledgeBaseIds.length === 0) {
      return [];
    }

    const results = await Promise.all(
      targetKnowledgeBaseIds.map((id) => this.searchSimilar(id, query, userId, options)),
    );

    return results
      .flat()
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.topK || 5);
  }

  // ==================== 辅助方法 ====================

  private async updateKbStats(knowledgeBaseId: bigint) {
    const docCount = await this.prisma.knowledgeDocumentEntity.count({
      where: { knowledgeBaseId, status: 'completed' },
    });
    const chunkAgg = await this.prisma.knowledgeDocChunkEntity.count({
      where: { document: { knowledgeBaseId } },
    });
    await this.prisma.knowledgeBaseEntity.update({
      where: { id: knowledgeBaseId },
      data: { docCount, chunkCount: chunkAgg },
    });
  }

  private toKbDto(entity: any) {
    return {
      id: entity.id.toString(),
      ownerUserId: entity.ownerUserId?.toString?.() ?? null,
      name: entity.name,
      description: entity.description,
      createdBy: entity.createdBy,
      docCount: entity.docCount,
      chunkCount: entity.chunkCount,
      status: entity.status,
      embeddingModel: entity.embeddingModel || '',
      chunkSize: entity.chunkSize ?? 500,
      chunkOverlap: entity.chunkOverlap ?? 50,
      chunkStrategy: entity.chunkStrategy || 'paragraph',
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toDocDto(entity: any) {
    return {
      id: entity.id.toString(),
      knowledgeBaseId: entity.knowledgeBaseId.toString(),
      fileName: entity.fileName,
      fileSize: entity.fileSize,
      fileType: entity.fileType,
      chunkCount: entity.chunkCount,
      status: entity.status,
      errorMsg: entity.errorMsg,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * 修复 multer 文件名编码问题
   * multer 将 multipart 中的 filename 按 Latin-1 解码，中文/日文等非 ASCII 字符会变成乱码
   * 这里将 Latin-1 字节还原后按 UTF-8 重新解码
   */
  private fixMulterFileName(originalName: string): string {
    try {
      const buf = Buffer.from(originalName, 'latin1');
      const decoded = buf.toString('utf8');
      const hasChinese = /[\u4e00-\u9fff]/.test(decoded);
      return hasChinese ? decoded : originalName;
    } catch {
      return originalName;
    }
  }
}
