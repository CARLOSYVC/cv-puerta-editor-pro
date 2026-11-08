import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { AuditLogModule } from '../audit-log/audit-log.module.js';
import { CurrentUserController } from './users.controller.js';

@Module({
  imports: [AuditLogModule],
  controllers: [UsersController, CurrentUserController],
  providers: [UsersService],
})
export class UsersModule {}
