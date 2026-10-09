import { Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from './public.decorator';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator';
import { authError } from './auth.errors';

// Compatibility read endpoints, without the unsafe phone/password login path.
@Controller('UserAccount')
export class AuthController {
  @Public()
  @Post('RegistOrLogin')
  legacyLogin(): never {
    throw authError(410, 'AUTH_LEGACY_DISABLED', '请使用邮箱验证码登录');
  }

  @Public()
  @Post('refreshtoken')
  legacyRefresh(): never {
    throw authError(410, 'AUTH_LEGACY_DISABLED', '请重新使用邮箱登录');
  }

  @Get('GetUserById')
  getUserById(@Query('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (id !== user.id)
      throw authError(403, 'AUTH_RESOURCE_FORBIDDEN', '无权读取该用户');
    return {
      errCode: 0,
      errMsg: '',
      data: {
        id: user.id,
        email: user.email,
        nickName: user.nickName,
        role: user.role,
      },
    };
  }

  @Get('GetUsers')
  getUsers(@CurrentUser() user: AuthenticatedUser) {
    return {
      errCode: 0,
      errMsg: '',
      data: [
        {
          id: user.id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          nickName: user.nickName,
        },
      ],
    };
  }

  @Get('GetCurrentUser')
  currentUser(@CurrentUser() user: AuthenticatedUser) {
    return {
      errCode: 0,
      errMsg: '',
      data: {
        UserId: user.id,
        NickName: user.nickName,
        Role: user.role,
        Email: user.email,
      },
    };
  }
}
