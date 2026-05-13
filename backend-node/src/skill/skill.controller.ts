import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { SkillService } from './skill.service';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { JsonResponse } from '../common/response';

@Controller('Skill')
export class SkillController {
  private readonly logger = new Logger(SkillController.name);

  constructor(private readonly skillService: SkillService) {}

  @Post('PublishFromFlow')
  async publishFromFlow(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    try {
      const result = await this.skillService.publishFromFlow(BigInt(dto.flowId), user.id, dto);
      if (!result) return JsonResponse.error('Flow not found');
      return JsonResponse.ok(result);
    } catch (err) {
      return this.toErrorResponse(err, 'PublishFromFlow');
    }
  }

  @Post('GenerateFromFlow')
  async generateFromFlow(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    try {
      const result = await this.skillService.generateFromFlow(BigInt(dto.flowId), user.id, dto);
      if (!result) return JsonResponse.error('Flow not found');
      return JsonResponse.ok(result);
    } catch (err) {
      return this.toErrorResponse(err, 'GenerateFromFlow');
    }
  }

  @Get('GetList')
  async getList(@CurrentUser() user: AuthenticatedUser) {
    return JsonResponse.ok(await this.skillService.getList(user.id));
  }

  @Get('GetDetail')
  async getDetail(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!id) return JsonResponse.error('id is required');
    const skill = await this.skillService.getById(BigInt(id), user.id);
    if (!skill) return JsonResponse.error('Skill not found');
    return JsonResponse.ok(skill);
  }

  @Get('GetAvailableModels')
  async getAvailableModels(@CurrentUser() user: AuthenticatedUser) {
    return JsonResponse.ok(await this.skillService.getAvailableModels(user.id));
  }

  @Post('Delete')
  async delete(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const ok = await this.skillService.delete(BigInt(id), user.id);
    if (!ok) return JsonResponse.error('Skill not found');
    return JsonResponse.ok(true);
  }

  /**
   * 把 service 抛出的 Error 转成业务 JsonResponse，
   * 避免 NestJS 默认 ExceptionFilter 返回 HTTP 500 + 通用 message，
   * 导致前端拦截器拿不到 errCode/errMsg，错误被静默吞掉。
   */
  private toErrorResponse(err: unknown, scope: string): JsonResponse {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`[${scope}] ${message}`, err instanceof Error ? err.stack : undefined);
    return JsonResponse.error(message);
  }
}
