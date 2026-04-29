import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { FlowService } from './flow.service';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';

const FLOW_TYPE_MAP: Record<string, number> = {
  LogicFlow: 0,
  AIFlow: 1,
  ApprovalFlow: 2,
};

function parseFlowType(value?: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (value in FLOW_TYPE_MAP) return FLOW_TYPE_MAP[value];
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

@Controller('Flow')
export class FlowController {
  constructor(private flowService: FlowService) {}

  @Post('Create')
  async create(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    if (typeof dto.flowType === 'string') {
      dto.flowType = FLOW_TYPE_MAP[dto.flowType] ?? 0;
    }
    const result = await this.flowService.create(dto, user.id, user.nickName || 'System');
    return { errCode: 0, errMsg: '', data: result };
  }

  @Get('GetById')
  async getById(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.flowService.getById(BigInt(id), user.id);
    if (!result) return { errCode: 1, errMsg: `flow not found, ID: ${id}` };
    return { errCode: 0, errMsg: '', data: result };
  }

  @Get('GetList')
  async getList(
    @Query('flowType') flowType?: string,
    @Query('pageIndex') pageIndex?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const result = await this.flowService.getList(
      user!.id,
      parseFlowType(flowType),
      Number(pageIndex || 1),
      Number(pageSize || 20),
    );
    return { errCode: 0, errMsg: '', data: result };
  }

  @Post('Update')
  async update(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.flowService.update(dto, user.id, user.nickName || 'System');
    if (!result) return { errCode: 1, errMsg: `flow not found, ID: ${dto.id}` };
    return { errCode: 0, errMsg: '', data: result };
  }

  @Post('Delete')
  async delete(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.flowService.delete(BigInt(id), user.id);
    if (!result) return { errCode: 1, errMsg: `flow not found, ID: ${id}` };
    return { errCode: 0, errMsg: '', data: true };
  }
}
