import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: any) {
    const exists = await this.prisma.flowLLMProviderEntity.findFirst({
      where: { platformName: dto.platformName },
    });
    if (exists) throw new Error(`platform '${dto.platformName}' already exists`);

    const entity = await this.prisma.flowLLMProviderEntity.create({
      data: {
        id: nextId(),
        platformName: dto.platformName,
        llmNames: JSON.stringify(dto.llmNames || []),
        llmAPIUrl: dto.llmAPIUrl || dto.llmapiUrl || '',
        llmAPIKey: dto.llmAPIKey || dto.llmapiKey || '',
      },
    });
    return this.toDto(entity);
  }

  async getById(id: bigint) {
    const entity = await this.prisma.flowLLMProviderEntity.findUnique({ where: { id } });
    return entity ? this.toDto(entity) : null;
  }

  async getList(platformName?: string) {
    const where = platformName ? { platformName: { contains: platformName } } : {};
    const entities = await this.prisma.flowLLMProviderEntity.findMany({
      where,
      orderBy: { id: 'asc' },
    });
    return entities.map((e) => this.toDto(e));
  }

  async update(dto: any) {
    const entity = await this.prisma.flowLLMProviderEntity.findUnique({
      where: { id: BigInt(dto.id) },
    });
    if (!entity) return null;

    const updateData: any = {};
    if (dto.platformName) updateData.platformName = dto.platformName;
    if (dto.llmNames) updateData.llmNames = JSON.stringify(dto.llmNames);
    const apiUrl = dto.llmAPIUrl ?? dto.llmapiUrl;
    const apiKey = dto.llmAPIKey ?? dto.llmapiKey;
    if (apiUrl !== undefined) updateData.llmAPIUrl = apiUrl;
    if (apiKey !== undefined) updateData.llmAPIKey = apiKey;

    const updated = await this.prisma.flowLLMProviderEntity.update({
      where: { id: BigInt(dto.id) },
      data: updateData,
    });
    return this.toDto(updated);
  }

  async delete(id: bigint) {
    const result = await this.prisma.flowLLMProviderEntity.deleteMany({ where: { id } });
    return result.count > 0;
  }

  async getAll() {
    const entities = await this.prisma.flowLLMProviderEntity.findMany();
    return entities.map((e) => this.toDto(e));
  }

  async findProviderByModelName(modelName: string) {
    const all = await this.prisma.flowLLMProviderEntity.findMany();
    for (const p of all) {
      const names: string[] = JSON.parse(p.llmNames || '[]');
      if (names.includes(modelName)) {
        return this.toDto(p);
      }
    }
    return all.length > 0 ? this.toDto(all[0]) : null;
  }

  /**
   * 查找可用于 embedding 调用的 provider。
   *
   * 匹配策略（按优先级）：
   * 1. llmNames 精确包含目标 embedding 模型名
   * 2. llmNames 中含有任何 "embedding" 关键字的 provider
   * 3. 放弃匹配，返回 null（由 EmbeddingService 走 TF-IDF 降级）
   */
  async findProviderForEmbedding(embeddingModelName?: string) {
    const all = await this.prisma.flowLLMProviderEntity.findMany();
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
      platformName: entity.platformName,
      llmNames: JSON.parse(entity.llmNames || '[]'),
      llmAPIUrl: entity.llmAPIUrl,
      llmAPIKey: entity.llmAPIKey,
      llmapiUrl: entity.llmAPIUrl,
      llmapiKey: entity.llmAPIKey,
    };
  }
}
