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
