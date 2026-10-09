import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuthConfig } from './auth.config';
import { EmailAuthController } from './email-auth.controller';
import { MailService } from './mail.service';
import { AuthRateLimitService } from './auth-rate-limit.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: new AuthConfig(configService).signingKey,
        signOptions: { algorithm: 'HS256' as const },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, EmailAuthController],
  providers: [
    AuthConfig,
    AuthService,
    JwtStrategy,
    MailService,
    AuthRateLimitService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
