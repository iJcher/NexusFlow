import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: any, userId: string) {
    const exists = await this.prisma.flowLLMProviderEntity.findFirst({
      where: { platformName: dto.platformName, ownerUserId: BigInt(userId) },
    });
    if (exists) throw new Error(`platform '${dto.platformName}' already exists`);

    const entity = await this.prisma.flowLLMProviderEntity.create({
      data: {
        id: nextId(),
        ownerUserId: BigInt(userId),
        platformName: dto.platformName,
        llmNames: JSON.stringify(dto.llmNames || []),
        llmAPIUrl: dto.llmAPIUrl || dto.llmapiUrl || '',
        llmAPIKey: dto.llmAPIKey || dto.llmapiKey || '',
      },
    });
    return this.toSafeDto(entity);
  }

  async getById(id: bigint, userId: string, options: { includeSecret?: boolean } = {}) {
    const entity = await this.prisma.flowLLMProviderEntity.findFirst({
      where: { id, ownerUserId: BigInt(userId) },
    });
    if (!entity) return null;
    return options.includeSecret ? this.toDto(entity) : this.toSafeDto(entity);
  }

  async getList(platformName: string | undefined, userId: string) {
    const where: any = { ownerUserId: BigInt(userId) };
    if (platformName) where.platformName = { contains: platformName };
    const entities = await this.prisma.flowLLMProviderEntity.findMany({
      where,
      orderBy: { id: 'asc' },
    });
    return entities.map((e) => this.toSafeDto(e));
  }

  async getSecretById(id: bigint, userId: string) {
    const entity = await this.prisma.flowLLMProviderEntity.findFirst({
      where: { id, ownerUserId: BigInt(userId) },
    });
    return entity ? this.toDto(entity) : null;
  }

  async update(dto: any, userId: string) {
    const entity = await this.prisma.flowLLMProviderEntity.findFirst({
      where: { id: BigInt(dto.id), ownerUserId: BigInt(userId) },
    });
    if (!entity) return null;

    const updateData: any = {};
    if (dto.platformName) updateData.platformName = dto.platformName;
    if (dto.llmNames) updateData.llmNames = JSON.stringify(dto.llmNames);
    const apiUrl = dto.llmAPIUrl ?? dto.llmapiUrl;
    const apiKey = dto.llmAPIKey ?? dto.llmapiKey;
    if (apiUrl !== undefined) updateData.llmAPIUrl = apiUrl;
    if (apiKey !== undefined && !String(apiKey).includes('****')) updateData.llmAPIKey = apiKey;

    const updated = await this.prisma.flowLLMProviderEntity.update({
      where: { id: BigInt(dto.id) },
      data: updateData,
    });
    return this.toSafeDto(updated);
  }

  async delete(id: bigint, userId: string) {
    const result = await this.prisma.flowLLMProviderEntity.deleteMany({
      where: { id, ownerUserId: BigInt(userId) },
    });
    return result.count > 0;
  }

  async getAll(userId?: string) {
    const entities = await this.prisma.flowLLMProviderEntity.findMany({
      where: userId ? { ownerUserId: BigInt(userId) } : undefined,
    });
    return entities.map((e) => this.toDto(e));
  }

  async findProviderByModelName(modelName: string, userId?: string) {
    const all = await this.prisma.flowLLMProviderEntity.findMany({
      where: userId ? { ownerUserId: BigInt(userId) } : undefined,
    });
    for (const p of all) {
      const names: string[] = JSON.parse(p.llmNames || '[]');
      if (names.includes(modelName)) {
        return this.toDto(p);
      }
    }
    return all.length > 0 ? this.toDto(all[0]) : null;
  }

  /**
   * 系统级默认 Skill 生成 provider（通过环境变量配置，所有用户共享）。
   *
   * 设计原因：
   * 1. 不进数据库 → 不污染用户的 LLM Provider 列表，也不会被前端 Mask 处理
   * 2. 任何已登录用户都可调用，作为零配置体验入口
   * 3. 模型名 / Url / Key 可在 ECS 的 .env 中独立运维
   */
  getDefaultSkillProvider(): {
    modelName: string;
    displayName: string;
    llmAPIUrl: string;
    llmAPIKey: string;
  } | null {
    const modelName = process.env.SKILL_DEFAULT_MODEL_NAME || '';
    const llmAPIUrl = process.env.SKILL_DEFAULT_API_URL || '';
    const llmAPIKey = process.env.SKILL_DEFAULT_API_KEY || '';
    if (!modelName || !llmAPIUrl || !llmAPIKey) return null;

    const displayName = process.env.SKILL_DEFAULT_DISPLAY_NAME || `NEXUS 免费模型 (${modelName})`;
    return { modelName, displayName, llmAPIUrl, llmAPIKey };
  }

  /**
   * 系统级默认 RAG embedding provider（通过环境变量配置，所有用户共享）。
   *
   * 与 getDefaultSkillProvider 同样的模式 ——
   * 让新用户即使没在「模型」页面配过任何 LLM Provider，
   * 也能开箱即用 RAG 能力（向量化 + 召回），而不是退到 TF-IDF 这种垃圾召回。
   *
   * 推荐配置：阿里云百炼 text-embedding-v4
   *   RAG_DEFAULT_EMBEDDING_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
   *   RAG_DEFAULT_EMBEDDING_MODEL_NAME=text-embedding-v4
   *   RAG_DEFAULT_EMBEDDING_API_KEY=sk-xxx (DashScope key)
   */
  getDefaultEmbeddingProvider(): {
    modelName: string;
    llmAPIUrl: string;
    llmAPIKey: string;
  } | null {
    const modelName = process.env.RAG_DEFAULT_EMBEDDING_MODEL_NAME || '';
    const llmAPIUrl = process.env.RAG_DEFAULT_EMBEDDING_API_URL || '';
    const llmAPIKey = process.env.RAG_DEFAULT_EMBEDDING_API_KEY || '';
    if (!modelName || !llmAPIUrl || !llmAPIKey) return null;
    return { modelName, llmAPIUrl, llmAPIKey };
  }

  /**
   * 系统级默认 Rerank（重排）provider
   *
   * 为什么独立而不复用 embedding：
   * - 协议不同：embedding 是 OpenAI 兼容 /v1/embeddings；rerank 是阿里 DashScope 原生 API
   * - 模型不同：embedding 用 text-embedding-v4；rerank 用 gte-rerank-v2
   * - 但 key 通常和 embedding 共用同一个 DashScope key
   *
   * 推荐配置：阿里云百炼 gte-rerank-v2
   *   RAG_DEFAULT_RERANK_API_URL=https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank
   *   RAG_DEFAULT_RERANK_MODEL_NAME=gte-rerank-v2
   *   RAG_DEFAULT_RERANK_API_KEY=sk-xxx (和 embedding 同一个 DashScope key 即可)
   */
  getDefaultRerankProvider(): {
    modelName: string;
    llmAPIUrl: string;
    llmAPIKey: string;
  } | null {
    const modelName = process.env.RAG_DEFAULT_RERANK_MODEL_NAME || '';
    const llmAPIUrl = process.env.RAG_DEFAULT_RERANK_API_URL || '';
    // key 兜底：rerank 没单独配就复用 embedding 的 key
    const llmAPIKey =
      process.env.RAG_DEFAULT_RERANK_API_KEY || process.env.RAG_DEFAULT_EMBEDDING_API_KEY || '';
    if (!modelName || !llmAPIUrl || !llmAPIKey) return null;
    return { modelName, llmAPIUrl, llmAPIKey };
  }

  /**
   * 查找可用于 embedding 调用的 provider。
   *
   * 匹配策略（按优先级）：
   * 1. llmNames 精确包含目标 embedding 模型名
   * 2. llmNames 中含有任何 "embedding" 关键字的 provider
   * 3. 放弃匹配，返回 null（由 EmbeddingService 走 TF-IDF 降级）
   */
  async findProviderForEmbedding(embeddingModelName?: string, userId?: string) {
    const all = await this.prisma.flowLLMProviderEntity.findMany({
      where: userId ? { ownerUserId: BigInt(userId) } : undefined,
    });
    if (all.length === 0) return null;

    if (embeddingModelName) {
      for (const p of all) {
        const names: string[] = JSON.parse(p.llmNames || '[]');
        if (names.includes(embeddingModelName)) {
          this.logger.log(`Embedding provider matched by model name: ${p.platformName}`);
          return this.toDto(p);
        }
      }
    }

    for (const p of all) {
      const names: string[] = JSON.parse(p.llmNames || '[]');
      if (names.some((n) => n.toLowerCase().includes('embedding'))) {
        this.logger.log(`Embedding provider matched by keyword: ${p.platformName}`);
        return this.toDto(p);
      }
    }

    this.logger.warn(
      `No provider has an embedding model in llmNames. ` +
        `Please add the embedding model name (e.g. text-embedding-v4) to a provider's model list.`,
    );
    return null;
  }

  private toDto(entity: any) {
    return {
      id: entity.id.toString(),
      ownerUserId: entity.ownerUserId?.toString?.() ?? null,
      platformName: entity.platformName,
      llmNames: JSON.parse(entity.llmNames || '[]'),
      llmAPIUrl: entity.llmAPIUrl,
      llmAPIKey: entity.llmAPIKey,
      llmapiUrl: entity.llmAPIUrl,
      llmapiKey: entity.llmAPIKey,
    };
  }

  private toSafeDto(entity: any) {
    const dto = this.toDto(entity);
    const masked = this.maskApiKey(dto.llmAPIKey);
    return {
      ...dto,
      llmAPIKey: masked,
      llmapiKey: masked,
    };
  }

  private maskApiKey(apiKey: string) {
    if (!apiKey) return '';
    if (apiKey.length <= 8) return '****';
    return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
  }
}
