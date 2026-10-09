import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { WorkspaceService, INVITABLE_ROLES } from './workspace.service';

class InviteDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsIn(INVITABLE_ROLES) role!: string;
}
class RoleDto {
  @IsIn(INVITABLE_ROLES) role!: string;
}
// Acceptance carries no client-controlled identity or role fields.
class AcceptInvitationDto {}
const uuid = new ParseUUIDPipe({ version: '4' });
function memberId(id: string) {
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
    throw new BadRequestException();
  return id;
}
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.id);
  }
  @Post('private') privateWorkspace(@CurrentUser() user: AuthenticatedUser) {
    return this.service.ensurePrivate(user.id);
  }
  @Get(':id/members') members(
    @Param('id', uuid) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.members(id, user.id);
  }
  @Post(':id/invitations') invite(
    @Param('id', uuid) id: string,
    @Body() body: InviteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.invite(id, user.id, body.email, body.role);
  }
  @Post('invitations/:invitationId/accept') accept(
    @Param('invitationId', uuid) id: string,
    @Body() _body: AcceptInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.accept(id, user.id);
  }
  @Delete(':id/invitations/:invitationId') revoke(
    @Param('id', uuid) id: string,
    @Param('invitationId', uuid) invitation: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.revoke(id, invitation, user.id);
  }
  @Patch(':id/members/:memberId') role(
    @Param('id', uuid) id: string,
    @Param('memberId') target: string,
    @Body() body: RoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.changeMember(id, memberId(target), user.id, body.role);
  }
  @Delete(':id/members/:memberId') remove(
    @Param('id', uuid) id: string,
    @Param('memberId') target: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.changeMember(id, memberId(target), user.id);
  }
}
