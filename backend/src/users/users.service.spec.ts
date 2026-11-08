import { Test } from '@nestjs/testing';
import { compare } from 'bcrypt';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    $transaction: vi.fn(),
    rolePermission: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const transaction = {
    rolePermission: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
  const auditLog = { record: vi.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    vi.clearAllMocks();
    transaction.rolePermission.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  it('creates users only through the managed path, hashes passwords, and records the actor', async () => {
    transaction.user.create.mockImplementation(
      async ({ data }: { data: { name: string; email: string; passwordHash: string; role: string } }) => ({
        id: 'new-user-id',
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: new Date('2026-11-07T00:00:00Z'),
        passwordHash: data.passwordHash,
      }),
    );

    await expect(service.create({
      name: ' New User ',
      email: 'NEW@example.com',
      password: 'a-long-temporary-password',
      role: 'VENTAS',
    }, 'admin-id')).resolves.toMatchObject({
      id: 'new-user-id',
      name: 'New User',
      email: 'new@example.com',
      role: 'VENTAS',
    });

    const createCall = transaction.user.create.mock.calls[0][0] as {
      data: { passwordHash: string };
    };
    await expect(
      compare('a-long-temporary-password', createCall.data.passwordHash),
    ).resolves.toBe(true);
    expect(createCall.data.passwordHash).not.toBe('a-long-temporary-password');
    expect(auditLog.record).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        userId: 'admin-id',
        action: 'CREATE',
        entity: 'User',
        entityId: 'new-user-id',
        after: { name: 'New User', email: 'new@example.com', role: 'VENTAS' },
      }),
    );
  });

  it('replaces permissions for a non-admin role atomically and audits the change', async () => {
    transaction.rolePermission.findMany.mockResolvedValue([
      { module: 'projects', action: 'READ' },
    ]);
    transaction.rolePermission.deleteMany.mockResolvedValue({ count: 1 });
    transaction.rolePermission.createMany.mockResolvedValue({ count: 2 });

    const permissions = [
      { module: 'clients', action: 'READ' as const },
      { module: 'projects', action: 'UPDATE' as const },
    ];
    await expect(service.updateRolePermissions('VENTAS', { permissions }, 'admin-id'))
      .resolves.toEqual({ role: 'VENTAS', permissions });

    expect(transaction.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { role: 'VENTAS' },
    });
    expect(transaction.rolePermission.createMany).toHaveBeenCalledWith({
      data: permissions.map((permission) => ({ ...permission, role: 'VENTAS' })),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        userId: 'admin-id',
        action: 'UPDATE',
        entity: 'RolePermission',
        entityId: 'VENTAS',
        before: { permissions: [{ module: 'projects', action: 'READ' }] },
        after: { permissions },
      }),
    );
  });

  it('prevents changes to ADMIN permissions', async () => {
    await expect(service.updateRolePermissions('ADMIN', { permissions: [] }, 'admin-id'))
      .rejects.toThrow('ADMIN permissions cannot be changed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
