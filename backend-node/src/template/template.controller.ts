import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { TemplateService } from './template.service';
import { JsonResponse } from '../common/response';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';

@Controller('FlowTemplate')
export class TemplateController {
  constructor(private templateService: TemplateService) {}

  @Post('Create')
  async create(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templateService.create(dto, user.id, user.nickName || 'System');
    return JsonResponse.ok(result);
  }

  @Post('CreateFromFlow')
  async createFromFlow(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templateService.createFromFlow(
      BigInt(dto.flowId),
      dto,
      user.id,
      user.nickName || 'System',
    );
    if (!result) return JsonResponse.error('Flow not found');
    return JsonResponse.ok(result);
  }

  @Get('GetById')
  async getById(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templateService.getById(BigInt(id), user.id);
    if (!result) return JsonResponse.error('Template not found');
    return JsonResponse.ok(result);
  }

  @Get('GetList')
  async getList(
    @Query('flowType') flowType?: string,
    @Query('category') category?: string,
    @Query('isOfficial') isOfficial?: string,
    @Query('keyword') keyword?: string,
    @Query('pageIndex') pageIndex?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const result = await this.templateService.getList({
      flowType: flowType !== undefined && flowType !== '' ? Number(flowType) : undefined,
      category: category || undefined,
      isOfficial: isOfficial !== undefined && isOfficial !== '' ? isOfficial === 'true' : undefined,
      keyword: keyword || undefined,
      pageIndex: Number(pageIndex || 1),
      pageSize: Number(pageSize || 20),
    }, user!.id);
    return JsonResponse.ok(result);
  }

  @Post('Update')
  async update(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templateService.update(BigInt(dto.id), dto, user.id);
    if (!result) return JsonResponse.error('Template not found');
    return JsonResponse.ok(result);
  }

  @Post('Delete')
  async delete(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templateService.delete(BigInt(id), user.id);
    if (!result) return JsonResponse.error('Template not found');
    return JsonResponse.ok(true);
  }
}
