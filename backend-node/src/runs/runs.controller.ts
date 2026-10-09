import {
  Allow,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { RunsRepository } from './repository';
import { ExecutionError, type Json } from './contracts';
export class PublishVersionDto {
  @Allow() graph!: unknown;
}
export class CreateRunDto {
  @IsUUID('4') versionId!: string;
  @Allow() input!: unknown;
}
export class ResolveOperationDto {
  @IsIn(['succeeded', 'not_executed']) decision!: 'succeeded' | 'not_executed';
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
  @Allow() output?: Json;
}
async function command<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ExecutionError)
      throw new BadRequestException({ code: error.code, message: error.code });
    throw error;
  }
}
@Controller('workflows')
export class VersionsController {
  constructor(readonly repo: RunsRepository) {}
  @Post(':flowId/versions')
  publish(
    @Param('flowId') flowId: string,
    @Body() body: PublishVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!/^[1-9]\d{0,18}$/.test(flowId)) throw new BadRequestException();
    return command(() =>
      this.repo.publish(BigInt(flowId), user.id, body.graph),
    );
  }
  @Post('versions/:versionId/disable')
  disable(
    @Param('versionId', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return command(() => this.repo.disableVersion(id, user.id));
  }
}
@Controller('runs')
export class RunsController {
  constructor(readonly repo: RunsRepository) {}
  @Post()
  @HttpCode(202)
  create(@Body() body: CreateRunDto, @CurrentUser() user: AuthenticatedUser) {
    return command(() => this.repo.create(body.versionId, user.id, body.input));
  }
  @Get(':runId')
  snapshot(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.repo.snapshot(id, user.id);
  }
  @Get(':runId/events')
  events(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('after') after: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (after !== undefined && !/^(0|[1-9]\d{0,9})$/.test(after))
      throw new BadRequestException();
    return this.repo.events(id, user.id, Number(after ?? 0));
  }
  @Post(':runId/cancel')
  @HttpCode(202)
  cancel(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.repo.cancel(id, user.id);
  }
  @Post(':runId/operations/:operationId/resolve')
  resolve(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('operationId', new ParseUUIDPipe({ version: '4' }))
    operationId: string,
    @Body() body: ResolveOperationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return command(() =>
      this.repo.resolveOperation(
        id,
        operationId,
        user.id,
        body.decision,
        body.reason,
        body.output,
      ),
    );
  }
}
