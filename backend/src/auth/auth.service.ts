import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { compare } from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.createAuthResponse({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  private async createAuthResponse(user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });
    return { access_token: accessToken, user };
  }
}
