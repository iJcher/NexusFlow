import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { nextId } from '../common/snowflake';
import * as path from 'path';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
    private chunkingService: ChunkingService,
  ) {}

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
    options: { topK?: number; threshold?: number; embeddingModel?: string } = {},
  ) {
    const { topK = 5, threshold = 0.3 } = options;
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

    const queryEmbedding = await this.embeddingService.getEmbedding(
      query,
      embeddingModel || undefined,
      userId,
    );

    const chunks = await this.prisma.knowledgeDocChunkEntity.findMany({
      where: {
        document: { knowledgeBaseId, knowledgeBase: { ownerUserId: ownerId } },
      },
      include: {
        document: { select: { fileName: true } },
      },
    });

    const scored = chunks
      .map((chunk) => {
        const embedding: number[] = chunk.embedding ? JSON.parse(chunk.embedding) : [];
        const similarity = this.embeddingService.cosineSimilarity(queryEmbedding, embedding);
        return {
          chunkId: chunk.id.toString(),
          documentId: chunk.documentId.toString(),
          fileName: chunk.document.fileName,
          source: `${chunk.document.fileName}#chunk-${chunk.chunkIndex}`,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          similarity,
        };
      })
      .filter((item) => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return scored;
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
