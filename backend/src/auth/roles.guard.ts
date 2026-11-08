import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionAction } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { MODULE_ACCESS_KEY, type AccessModule } from './module-access.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const module = this.reflector.getAllAndOverride<AccessModule>(
      MODULE_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!module) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;
    if (!userId) throw new ForbiddenException('User identity is required');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new ForbiddenException('User account is unavailable');
    const action = this.getAction(request.method);
    const permission = await this.prisma.rolePermission.findUnique({
      where: { role_module_action: { role: user.role, module, action } },
      select: { role: true },
    });
    if (!permission) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }

  private getAction(method: string): PermissionAction {
    switch (method) {
      case 'GET':
      case 'HEAD':
      case 'OPTIONS':
        return PermissionAction.READ;
      case 'POST':
        return PermissionAction.CREATE;
      case 'PUT':
      case 'PATCH':
        return PermissionAction.UPDATE;
      case 'DELETE':
        return PermissionAction.DELETE;
      default:
        throw new ForbiddenException('Unsupported HTTP method');
    }
  }
}
