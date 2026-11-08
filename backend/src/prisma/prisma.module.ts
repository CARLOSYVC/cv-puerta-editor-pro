import { Global, Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, RolesGuard],
  exports: [PrismaService, RolesGuard],
})
export class PrismaModule {}
