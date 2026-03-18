import { Controller, Post, Body, Get, Query, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserDto } from './dto/user.dto';
import { Public } from './public.decorator';

@Controller('UserAccount')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('RegistOrLogin')
  @Public()
  async registOrLogin(@Body() dto: UserDto, @Req() req: any) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const token = await this.authService.registOrLogin(dto.phoneNumber, dto.password, ip);
    return { errCode: 0, errMsg: '', data: token };
  }

  @Post('refreshtoken')
  async refreshToken(@Body() dto: { refreshToken: string }, @Req() req: any) {
    const token = await this.authService.refreshToken(dto.refreshToken, req.user.id);
    return { errCode: 0, errMsg: '', data: token };
  }

  @Get('GetUserById')
  async getUserById(@Query('id') id: string) {
    const user = await this.authService.getUserById(BigInt(id));
    if (!user) return { errCode: 1, errMsg: 'user not found' };
    return { errCode: 0, errMsg: '', data: user };
  }

  @Get('GetUsers')
  async getUsers() {
    const users = await this.authService.getUsers();
    return { errCode: 0, errMsg: '', data: users };
  }

  @Get('GetCurrentUser')
  getCurrentUser(@Req() req: any) {
    if (!req.user) return { errCode: 1, errMsg: 'user not found' };
    return {
      errCode: 0,
      errMsg: '',
      data: {
        UserId: req.user.id,
        NickName: req.user.nickName,
        Role: req.user.role,
      },
    };
  }
}
