import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { SignOptions } from 'jsonwebtoken';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

function getJwtExpiration(): SignOptions['expiresIn'] {
  const expiration = process.env.JWT_EXPIRES_IN;
  if (!expiration || !/^\d+(s|m|h|d|w|y)$/.test(expiration)) {
    throw new Error('JWT_EXPIRES_IN must be a duration such as 7d');
  }
  return expiration as SignOptions['expiresIn'];
}

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: getJwtExpiration() },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
