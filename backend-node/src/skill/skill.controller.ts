import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SkillService } from './skill.service';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { JsonResponse } from '../common/response';

@Controller('Skill')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Post('PublishFromFlow')
  async publishFromFlow(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.skillService.publishFromFlow(BigInt(dto.flowId), user.id, dto);
    if (!result) return JsonResponse.error('Flow not found');
    return JsonResponse.ok(result);
  }

  @Get('GetList')
  async getList(@CurrentUser() user: AuthenticatedUser) {
    return JsonResponse.ok(await this.skillService.getList(user.id));
  }

  @Post('Delete')
  async delete(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const ok = await this.skillService.delete(BigInt(id), user.id);
    if (!ok) return JsonResponse.error('Skill not found');
    return JsonResponse.ok(true);
  }
}
