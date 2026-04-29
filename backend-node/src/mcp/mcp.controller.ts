import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { McpService } from './mcp.service';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { JsonResponse } from '../common/response';

@Controller('Mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post('Create')
  async create(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return JsonResponse.ok(await this.mcpService.create(dto, user.id));
  }

  @Get('GetList')
  async getList(@CurrentUser() user: AuthenticatedUser) {
    return JsonResponse.ok(await this.mcpService.getList(user.id));
  }

  @Post('Delete')
  async delete(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const ok = await this.mcpService.delete(BigInt(id), user.id);
    if (!ok) return JsonResponse.error('MCP server not found');
    return JsonResponse.ok(true);
  }
}
