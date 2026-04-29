import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';

@Injectable()
export class McpService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: any, userId: string) {
    const entity = await this.prisma.mcpServerEntity.create({
      data: {
        id: nextId(),
        ownerUserId: BigInt(userId),
        name: dto.name || '',
        transport: dto.transport || 'sse',
        endpoint: dto.endpoint || '',
        command: dto.command || '',
        args: JSON.stringify(dto.args || []),
        env: JSON.stringify(dto.env || {}),
      },
    });
    return this.toDto(entity);
  }

  async getList(userId: string) {
    const entities = await this.prisma.mcpServerEntity.findMany({
      where: { ownerUserId: BigInt(userId), status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return entities.map((entity) => this.toDto(entity));
  }

  async delete(id: bigint, userId: string) {
    const result = await this.prisma.mcpServerEntity.updateMany({
      where: { id, ownerUserId: BigInt(userId) },
      data: { status: 'deleted' },
    });
    return result.count > 0;
  }

  private toDto(entity: any) {
    return {
      id: entity.id.toString(),
      ownerUserId: entity.ownerUserId.toString(),
      name: entity.name,
      transport: entity.transport,
      endpoint: entity.endpoint,
      command: entity.command,
      args: JSON.parse(entity.args || '[]'),
      env: JSON.parse(entity.env || '{}'),
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
