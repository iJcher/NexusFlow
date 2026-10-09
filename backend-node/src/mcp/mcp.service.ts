import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';
import { McpServerEntity } from '@prisma/client';
import { parseJson } from '../common/json.util';
import { McpWriteDto } from './mcp.dto';
import { assertJson } from '../runs/contracts';
import { SecretVault, connectionSecretContext } from '../security/secret-vault';

@Injectable()
export class McpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SecretVault,
  ) {}

  async create(dto: McpWriteDto, userId: string) {
    for (const values of [dto.env ?? {}, dto.headers ?? {}]) {
      if (Object.values(values).some((value) => typeof value !== 'string'))
        throw new BadRequestException(
          'Connection secret values must be strings',
        );
    }
    assertJson(
      {
        args: dto.args ?? [],
        env: dto.env ?? {},
        headers: dto.headers ?? {},
        tools: dto.tools ?? [],
      },
      65536,
    );
    const id = nextId();
    const entity = await this.prisma.mcpServerEntity.create({
      data: {
        id,
        ownerUserId: BigInt(userId),
        name: dto.name || '',
        transport: dto.transport || 'sse',
        endpoint: dto.endpoint || '',
        command: dto.command || '',
        args: JSON.stringify(dto.args || []),
        env: this.vault.seal(
          JSON.stringify(dto.env || {}),
          connectionSecretContext('mcp', id, BigInt(userId), 'env'),
        ),
        headers: this.vault.seal(
          JSON.stringify(dto.headers || {}),
          connectionSecretContext('mcp', id, BigInt(userId), 'headers'),
        ),
        toolsJson: JSON.stringify(dto.tools || []),
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

  async getSecretById(id: bigint, userId: string) {
    const entity = await this.prisma.mcpServerEntity.findFirst({
      where: { id, ownerUserId: BigInt(userId), status: 'active' },
    });
    if (!entity) return null;
    return {
      ...entity,
      env: this.secretObject(entity, 'env'),
      headers: this.secretObject(entity, 'headers'),
    };
  }

  private secretObject(
    entity: McpServerEntity,
    field: 'env' | 'headers',
  ): Record<string, string> {
    const decoded = parseJson(
      this.vault.open(
        entity[field],
        connectionSecretContext('mcp', entity.id, entity.ownerUserId, field),
      ),
    );
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      Array.isArray(decoded) ||
      Object.values(decoded).some((value) => typeof value !== 'string')
    )
      throw new Error('INVALID_CONNECTION_SECRET_OBJECT');
    return decoded as Record<string, string>;
  }

  private maskedObject(entity: McpServerEntity, field: 'env' | 'headers') {
    return Object.fromEntries(
      Object.keys(this.secretObject(entity, field)).map((key) => [key, '****']),
    );
  }

  private toDto(entity: McpServerEntity) {
    return {
      id: entity.id.toString(),
      ownerUserId: entity.ownerUserId.toString(),
      name: entity.name,
      transport: entity.transport,
      endpoint: entity.endpoint,
      command: entity.command,
      args: parseJson(entity.args || '[]'),
      env: this.maskedObject(entity, 'env'),
      headers: this.maskedObject(entity, 'headers'),
      tools: parseJson(entity.toolsJson || '[]'),
      lastSyncAt: entity.lastSyncAt,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
