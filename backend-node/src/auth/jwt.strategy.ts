import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthConfig } from './auth.config';
import { AuthService } from './auth.service';

export interface JwtPayload {
  sub: string;
  sid: string;
  authVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AuthConfig,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.signingKey,
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    if (
      payload.authVersion !== 2 ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      throw new UnauthorizedException();
    }
    const user = await this.auth.authenticatedUser(payload.sub, payload.sid);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
