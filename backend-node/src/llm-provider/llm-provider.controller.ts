import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { LlmProviderService } from './llm-provider.service';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';

@Controller('FlowLLMProvider')
export class LlmProviderController {
  constructor(private llmProviderService: LlmProviderService) {}

  @Post('Create')
  async create(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    try {
      const result = await this.llmProviderService.create(dto, user.id);
      return { errCode: 0, errMsg: '', data: result };
    } catch (e: any) {
      return { errCode: 1, errMsg: e.message };
    }
  }

  @Get('GetById')
  async getById(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.llmProviderService.getById(BigInt(id), user.id);
    if (!result) return { errCode: 1, errMsg: `provider not found, ID: ${id}` };
    return { errCode: 0, errMsg: '', data: result };
  }

  @Get('GetList')
  async getList(@Query('platformName') platformName: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.llmProviderService.getList(platformName, user.id);
    return { errCode: 0, errMsg: '', data: result };
  }

  @Post('Update')
  async update(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.llmProviderService.update(dto, user.id);
    if (!result) return { errCode: 1, errMsg: `provider not found, ID: ${dto.id}` };
    return { errCode: 0, errMsg: '', data: result };
  }

  @Post('Delete')
  async delete(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.llmProviderService.delete(BigInt(id), user.id);
    if (!result) return { errCode: 1, errMsg: `provider not found, ID: ${id}` };
    return { errCode: 0, errMsg: '', data: true };
  }
}
