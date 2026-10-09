import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthConfig } from './auth.config';
import { Public } from './public.decorator';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator';
import { EmailCodeDto, EmailLoginDto } from './dto/email-auth.dto';
import { authError } from './auth.errors';

@Controller('auth')
export class EmailAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AuthConfig,
  ) {}

  private checkOrigin(req: Request, required = true): void {
    const origin = req.get('origin');
    if (
      (!origin && required) ||
      (origin && !this.config.origins.includes(origin))
    ) {
      throw authError(403, 'AUTH_ORIGIN_DENIED', '请求来源不受信任');
    }
  }

  private cookie(req: Request): string | null {
    const pair = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('nf_refresh='));
    const token = pair?.slice('nf_refresh='.length);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }

  private setCookie(res: Response, token: string): void {
    res.cookie('nf_refresh', token, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'strict',
      path: '/auth',
      maxAge: this.config.refreshTtl * 1000,
    });
    res.setHeader('Cache-Control', 'no-store');
  }

  @Public()
  @Post('email/code')
  @HttpCode(202)
  async code(
    @Body() dto: EmailCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.checkOrigin(req, false);
    res.setHeader('Cache-Control', 'no-store');
    return {
      errCode: 0,
      errMsg: '',
      data: await this.auth.sendEmailCode(dto.email, req.ip || 'unknown'),
    };
  }

  @Public()
  @Post('email/login')
  @HttpCode(200)
  async login(
    @Body() dto: EmailLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.checkOrigin(req);
    const result = await this.auth.login(dto, req.ip || 'unknown');
    this.setCookie(res, result.refreshToken);
    return { errCode: 0, errMsg: '', data: result.body };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.checkOrigin(req);
    const token = this.cookie(req);
    if (!token) throw authError(401, 'AUTH_SESSION_INVALID', '请重新登录');
    const result = await this.auth.refresh(token, req.ip || 'unknown');
    this.setCookie(res, result.refreshToken);
    return { errCode: 0, errMsg: '', data: result.body };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.checkOrigin(req);
    await this.auth.logout(this.cookie(req));
    res.clearCookie('nf_refresh', {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'strict',
      path: '/auth',
    });
    res.setHeader('Cache-Control', 'no-store');
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
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
}
