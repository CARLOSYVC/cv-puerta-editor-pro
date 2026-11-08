import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionAction, UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { defaultRolePermissions } from './permissions.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: vi.fn(),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    rolePermission: {
      findUnique: vi.fn(),
    },
  };
  let guard: RolesGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.rolePermission.findUnique.mockImplementation(
      async ({ where }: { where: { role_module_action: { role: UserRole; module: string; action: PermissionAction } } }) => {
        const { role, module, action } = where.role_module_action;
        const permitted = defaultRolePermissions[role].some(
          (permission) => permission.module === module && permission.action === action,
        );
        return permitted ? { role } : null;
      },
    );
    guard = new RolesGuard(reflector as unknown as Reflector, prisma as unknown as PrismaService);
  });

  function context(module: string, method: string, role: UserRole) {
    reflector.getAllAndOverride.mockReturnValue(module);
    prisma.user.findUnique.mockResolvedValue({ role });
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ method, user: { sub: 'user-id', role } }),
      }),
    } as never;
  }

  it('maps HTTP verbs to CRUD permissions and denies missing actions', async () => {
    await expect(guard.canActivate(context('clients', 'GET', UserRole.VENTAS))).resolves.toBe(true);
    await expect(guard.canActivate(context('clients', 'POST', UserRole.VENTAS))).resolves.toBe(true);
    await expect(guard.canActivate(context('clients', 'PATCH', UserRole.VENTAS))).resolves.toBe(true);
    await expect(guard.canActivate(context('clients', 'DELETE', UserRole.VENTAS))).resolves.toBe(true);
    await expect(guard.canActivate(context('costs', 'POST', UserRole.PRODUCCION)))
      .rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context('inventory', 'DELETE', UserRole.GERENTE)))
      .rejects.toThrow(ForbiddenException);
  });

  it('allows unannotated handlers and requires a role for protected handlers', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(context('clients', 'GET', UserRole.VENTAS))).resolves.toBe(true);

    reflector.getAllAndOverride.mockReturnValue('clients');
    const requestContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => ({ method: 'GET', user: {} }) }),
    } as never;
    await expect(guard.canActivate(requestContext)).rejects.toThrow(ForbiddenException);
  });

  it('queries the persisted role, module, and action permission', async () => {
    await guard.canActivate(context('projects', 'PATCH', UserRole.VENTAS));
    expect(prisma.rolePermission.findUnique).toHaveBeenCalledWith({
      where: {
        role_module_action: {
          role: UserRole.VENTAS,
          module: 'projects',
          action: PermissionAction.UPDATE,
        },
      },
      select: { role: true },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: { role: true },
    });
  });

  it('uses the current database role instead of a stale token role', async () => {
    const requestContext = context('clients', 'POST', UserRole.VENTAS);
    prisma.user.findUnique.mockResolvedValue({ role: UserRole.GERENTE });
    await expect(guard.canActivate(requestContext))
      .rejects.toThrow(ForbiddenException);
  });
});
