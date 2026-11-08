import { NotFoundException } from '@nestjs/common';
import { PermissionAction } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GlobalSearchService } from './global-search.service.js';

describe('GlobalSearchService', () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    rolePermission: { findMany: vi.fn() },
    client: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
    material: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    productionOrder: { findMany: vi.fn() },
  };
  let service: GlobalSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GlobalSearchService(prisma as unknown as PrismaService);
  });

  it('searches only modules with current database READ grants', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'VENTAS' });
    prisma.rolePermission.findMany.mockResolvedValue([
      { module: 'clients' },
      { module: 'projects' },
    ]);
    prisma.client.findMany.mockResolvedValue([{
      id: 'client-id',
      name: 'Acme',
      companyName: 'Acme Studio',
      email: null,
    }]);
    prisma.project.findMany.mockResolvedValue([]);

    await expect(service.search(' Acme ', 'user-id')).resolves.toEqual([
      {
        id: 'client-id',
        entity: 'Cliente',
        label: 'Acme',
        detail: 'Acme Studio',
        module: 'clients',
      },
    ]);

    expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
      where: { role: 'VENTAS', action: PermissionAction.READ },
      select: { module: true },
    });
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
    expect(prisma.material.findMany).not.toHaveBeenCalled();
    expect(prisma.supplier.findMany).not.toHaveBeenCalled();
  });

  it('rejects searches for accounts that no longer exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.search('Acme', 'missing-user')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });
});
