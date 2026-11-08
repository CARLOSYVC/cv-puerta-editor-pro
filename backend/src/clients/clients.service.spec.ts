import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ClientsService', () => {
  let service: ClientsService;
  const prisma = {
    client: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('searches and paginates clients with stable ordering', async () => {
    const clients = [{
      id: 'client-id',
      name: 'Acme Studio',
      projects: [{ id: 'project-id', name: 'New website' }],
      _count: { projects: 1 },
    }];
    prisma.client.count.mockResolvedValue(21);
    prisma.client.findMany.mockResolvedValue(clients);

    await expect(service.findPaginated({
      query: ' Acme ',
      page: 2,
      pageSize: 10,
    })).resolves.toEqual({
      items: clients,
      total: 21,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });

    expect(prisma.client.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'Acme', mode: 'insensitive' } },
          { companyName: { contains: 'Acme', mode: 'insensitive' } },
          { email: { contains: 'Acme', mode: 'insensitive' } },
          { phone: { contains: 'Acme', mode: 'insensitive' } },
          { notes: { contains: 'Acme', mode: 'insensitive' } },
        ],
      },
    });
    expect(prisma.client.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'Acme', mode: 'insensitive' } },
          { companyName: { contains: 'Acme', mode: 'insensitive' } },
          { email: { contains: 'Acme', mode: 'insensitive' } },
          { phone: { contains: 'Acme', mode: 'insensitive' } },
          { notes: { contains: 'Acme', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
      include: {
        projects: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
          take: 3,
        },
        _count: { select: { projects: true } },
      },
    });
  });

  it('clamps a page beyond the last result page', async () => {
    prisma.client.count.mockResolvedValue(1);
    prisma.client.findMany.mockResolvedValue([]);

    await expect(service.findPaginated({
      page: 9,
      pageSize: 10,
    })).resolves.toMatchObject({ page: 1, totalPages: 1 });
    expect(prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 10,
      include: expect.objectContaining({
        _count: { select: { projects: true } },
      }),
    }));
  });

  it('updates and deletes clients through Prisma', async () => {
    const client = { id: 'client-id', name: 'Updated client' };
    prisma.client.update.mockResolvedValue(client);
    prisma.client.delete.mockResolvedValue(client);

    await expect(service.update('client-id', { name: 'Updated client' }))
      .resolves.toEqual(client);
    await expect(service.remove('client-id')).resolves.toEqual(client);
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: 'client-id' },
      data: { name: 'Updated client' },
    });
    expect(prisma.client.delete).toHaveBeenCalledWith({
      where: { id: 'client-id' },
    });
  });
});
