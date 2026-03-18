import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { md5, generateSalt } from '../common/crypto.util';
import { nextId } from '../common/snowflake';
import { AuthTokenDto } from './dto/user.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async registOrLogin(phoneNumber: string, password: string, ip: string): Promise<AuthTokenDto> {
    let user = await this.prisma.userEntity.findUnique({ where: { phoneNumber } });

    if (!user) {
      const salt = generateSalt();
      user = await this.prisma.userEntity.create({
        data: {
          id: nextId(),
          phoneNumber,
          passwordSalt: salt,
          passwordHash: md5(password + salt),
          nickName: phoneNumber,
          registerTime: new Date(),
          lastLoginIp: ip,
          lastLoginTime: new Date(),
          role: 1,
        },
      });
    } else {
      await this.prisma.userEntity.update({
        where: { phoneNumber },
        data: { lastLoginIp: ip, lastLoginTime: new Date() },
      });
    }

    const payload = {
      sub: user.id.toString(),
      phoneNumber: user.phoneNumber,
      nickName: user.nickName,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      type: 'Bearer',
      accessToken,
      expiresIn: 3600,
      refreshToken: this.jwtService.sign(payload, { expiresIn: '18000s' }),
    };
  }

  async getUserById(id: bigint) {
    return this.prisma.userEntity.findUnique({ where: { id } });
  }

  async getUsers() {
    return this.prisma.userEntity.findMany({
      where: { role: 1 },
      select: { id: true, phoneNumber: true },
    });
  }

  async refreshToken(refreshTokenStr: string, userId: string): Promise<AuthTokenDto> {
    const user = await this.prisma.userEntity.findUnique({ where: { id: BigInt(userId) } });
    if (!user) throw new Error('User not found');

    const payload = {
      sub: user.id.toString(),
      phoneNumber: user.phoneNumber,
      nickName: user.nickName,
      role: user.role,
    };

    return {
      type: 'Bearer',
      accessToken: this.jwtService.sign(payload),
      expiresIn: 3600,
      refreshToken: this.jwtService.sign(payload, { expiresIn: '18000s' }),
    };
  }
}
