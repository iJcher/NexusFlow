import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';

@Injectable()
export class SkillService {
  constructor(private readonly prisma: PrismaService) {}

  async publishFromFlow(flowId: bigint, userId: string, dto: { name?: string; description?: string; inputSchema?: unknown; outputSchema?: unknown }) {
    const ownerUserId = BigInt(userId);
    const flow = await this.prisma.flowEntity.findFirst({ where: { id: flowId, ownerUserId } });
    if (!flow) return null;

    const skill = await this.prisma.skillEntity.create({
      data: {
        id: nextId(),
        ownerUserId,
        flowId,
        name: dto.name || flow.displayName,
        description: dto.description || flow.description || '',
        inputSchema: JSON.stringify(dto.inputSchema || {}),
        outputSchema: JSON.stringify(dto.outputSchema || {}),
        workflowSnapshot: JSON.stringify({
          configInfoForRun: flow.configInfoForRun ? JSON.parse(flow.configInfoForRun) : null,
          configInfoForWeb: flow.configInfoForWeb,
        }),
      },
    });

    return this.toDto(skill);
  }

  async getList(userId: string) {
    const skills = await this.prisma.skillEntity.findMany({
      where: { ownerUserId: BigInt(userId), status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return skills.map((skill) => this.toDto(skill));
  }

  async delete(id: bigint, userId: string) {
    const result = await this.prisma.skillEntity.updateMany({
      where: { id, ownerUserId: BigInt(userId) },
      data: { status: 'deleted' },
    });
    return result.count > 0;
  }

  private toDto(entity: any) {
    return {
      id: entity.id.toString(),
      ownerUserId: entity.ownerUserId.toString(),
      flowId: entity.flowId.toString(),
      name: entity.name,
      description: entity.description,
      version: entity.version,
      inputSchema: JSON.parse(entity.inputSchema || '{}'),
      outputSchema: JSON.parse(entity.outputSchema || '{}'),
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
