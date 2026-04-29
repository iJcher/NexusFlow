import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: any, userId: string, userName: string) {
    const entity = await this.prisma.flowEntity.create({
      data: {
        id: nextId(),
        ownerUserId: BigInt(userId),
        displayName: dto.displayName || '',
        flowType: dto.flowType || 0,
        description: dto.description || '',
        configInfoForRun: dto.configInfoForRun ? JSON.stringify(dto.configInfoForRun) : null,
        configInfoForWeb: dto.configInfoForWeb || null,
        lastModified: new Date(),
        lastModifyBy: userName,
      },
    });
    this.logger.log(`create flow success, ID: ${entity.id}`);
    return this.toDto(entity);
  }

  async getById(id: bigint, userId: string) {
    const entity = await this.prisma.flowEntity.findFirst({
      where: { id, ownerUserId: BigInt(userId) },
    });
    return entity ? this.toDto(entity) : null;
  }

  async getList(userId: string, flowType?: number, pageIndex = 1, pageSize = 20) {
    const where: any = { ownerUserId: BigInt(userId) };
    if (flowType !== undefined) where.flowType = flowType;
    const entities = await this.prisma.flowEntity.findMany({
      where,
      orderBy: { lastModified: 'desc' },
      skip: (pageIndex - 1) * pageSize,
      take: pageSize,
    });
    return entities.map((e) => this.toDto(e));
  }

  async update(dto: any, userId: string, userName: string) {
    const id = BigInt(dto.id);
    const entity = await this.prisma.flowEntity.findFirst({
      where: { id, ownerUserId: BigInt(userId) },
    });
    if (!entity) return null;

    const updateData: any = { lastModified: new Date(), lastModifyBy: userName };
    if (dto.displayName) updateData.displayName = dto.displayName;
    if (dto.description) updateData.description = dto.description;
    if (dto.configInfoForRun !== undefined)
      updateData.configInfoForRun = dto.configInfoForRun ? JSON.stringify(dto.configInfoForRun) : null;
    if (dto.configInfoForWeb !== undefined) updateData.configInfoForWeb = dto.configInfoForWeb;

    const updated = await this.prisma.flowEntity.update({
      where: { id },
      data: updateData,
    });
    return this.toDto(updated);
  }

  async delete(id: bigint, userId: string) {
    const result = await this.prisma.flowEntity.deleteMany({
      where: { id, ownerUserId: BigInt(userId) },
    });
    return result.count > 0;
  }

  private toDto(entity: any) {
    return {
      id: entity.id.toString(),
      ownerUserId: entity.ownerUserId?.toString?.() ?? null,
      displayName: entity.displayName,
      flowType: entity.flowType,
      description: entity.description,
      configInfoForRun: entity.configInfoForRun ? JSON.parse(entity.configInfoForRun) : null,
      configInfoForWeb: entity.configInfoForWeb,
      lastModified: entity.lastModified,
      lastModifyBy: entity.lastModifyBy,
    };
  }
}
