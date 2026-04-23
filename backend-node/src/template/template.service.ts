import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: any, userName: string) {
    const entity = await this.prisma.flowTemplateEntity.create({
      data: {
        id: nextId(),
        name: dto.name || '',
        description: dto.description || '',
        flowType: dto.flowType ?? 0,
        category: dto.category || 'custom',
        tags: dto.tags ? JSON.stringify(dto.tags) : '[]',
        configInfoForRun: dto.configInfoForRun ? JSON.stringify(dto.configInfoForRun) : null,
        configInfoForWeb: dto.configInfoForWeb || null,
        isOfficial: dto.isOfficial ?? false,
        createdBy: userName,
      },
    });
    this.logger.log(`Template created, ID: ${entity.id}`);
    return this.toDto(entity);
  }

  async createFromFlow(flowId: bigint, dto: any, userName: string) {
    const flow = await this.prisma.flowEntity.findUnique({ where: { id: flowId } });
    if (!flow) return null;

    return this.create(
      {
        name: dto.name || flow.displayName,
        description: dto.description || flow.description,
        flowType: flow.flowType,
        category: dto.category || 'custom',
        tags: dto.tags || [],
        configInfoForRun: flow.configInfoForRun ? JSON.parse(flow.configInfoForRun) : null,
        configInfoForWeb: flow.configInfoForWeb,
      },
      userName,
    );
  }

  async getById(id: bigint) {
    const entity = await this.prisma.flowTemplateEntity.findUnique({ where: { id } });
    return entity ? this.toDto(entity) : null;
  }

  async getList(params: {
    flowType?: number;
    category?: string;
    isOfficial?: boolean;
    keyword?: string;
    pageIndex?: number;
    pageSize?: number;
  }) {
    const { flowType, category, isOfficial, keyword, pageIndex = 1, pageSize = 20 } = params;
    const where: any = {};
    if (flowType !== undefined) where.flowType = flowType;
    if (category) where.category = category;
    if (isOfficial !== undefined) where.isOfficial = isOfficial;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    const [total, entities] = await Promise.all([
      this.prisma.flowTemplateEntity.count({ where }),
      this.prisma.flowTemplateEntity.findMany({
        where,
        orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
        skip: (pageIndex - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      items: entities.map((e) => this.toDto(e)),
    };
  }

  async update(id: bigint, dto: any) {
    const entity = await this.prisma.flowTemplateEntity.findUnique({ where: { id } });
    if (!entity) return null;

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.tags !== undefined) updateData.tags = JSON.stringify(dto.tags);
    if (dto.configInfoForRun !== undefined)
      updateData.configInfoForRun = dto.configInfoForRun ? JSON.stringify(dto.configInfoForRun) : null;
    if (dto.configInfoForWeb !== undefined) updateData.configInfoForWeb = dto.configInfoForWeb;

    const updated = await this.prisma.flowTemplateEntity.update({
      where: { id },
      data: updateData,
    });
    return this.toDto(updated);
  }

  async delete(id: bigint) {
    const result = await this.prisma.flowTemplateEntity.deleteMany({ where: { id } });
    return result.count > 0;
  }

  private toDto(entity: any) {
    return {
      id: entity.id.toString(),
      name: entity.name,
      description: entity.description,
      flowType: entity.flowType,
      category: entity.category,
      tags: entity.tags ? JSON.parse(entity.tags) : [],
      configInfoForRun: entity.configInfoForRun ? JSON.parse(entity.configInfoForRun) : null,
      configInfoForWeb: entity.configInfoForWeb,
      isOfficial: entity.isOfficial,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
