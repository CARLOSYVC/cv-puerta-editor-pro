import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { MaterialsService } from './materials.service.js';

describe('MaterialsService', () => {
  let service: MaterialsService;
  const material = {
    id: 'material-id',
    name: 'Cotton canvas',
    description: null,
    unit: 'meter',
    unitCost: '12.50',
    minimumStock: '0.00',
  };
  const prisma = {
    material: {
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
        MaterialsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MaterialsService>(MaterialsService);
  });

  it('lists materials by creation date', async () => {
    prisma.material.findMany.mockResolvedValue([material]);

    await expect(service.findAll()).resolves.toEqual([material]);
    expect(prisma.material.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('finds a material by id', async () => {
    prisma.material.findUniqueOrThrow.mockResolvedValue(material);

    await expect(service.findOne(material.id)).resolves.toEqual(material);
    expect(prisma.material.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: material.id },
    });
  });

  it('creates a material', async () => {
    const input = {
      name: material.name,
      unit: material.unit,
      unitCost: 12.5,
    };
    prisma.material.create.mockResolvedValue(material);

    await expect(service.create(input)).resolves.toEqual(material);
    expect(prisma.material.create).toHaveBeenCalledWith({ data: input });
  });

  it('updates a material', async () => {
    const input = { name: 'Updated canvas' };
    prisma.material.update.mockResolvedValue({ ...material, ...input });

    await expect(service.update(material.id, input)).resolves.toMatchObject({
      name: 'Updated canvas',
    });
    expect(prisma.material.update).toHaveBeenCalledWith({
      where: { id: material.id },
      data: input,
    });
  });

  it('deletes a material', async () => {
    prisma.material.delete.mockResolvedValue(material);

    await expect(service.remove(material.id)).resolves.toEqual(material);
    expect(prisma.material.delete).toHaveBeenCalledWith({
      where: { id: material.id },
    });
  });
});
