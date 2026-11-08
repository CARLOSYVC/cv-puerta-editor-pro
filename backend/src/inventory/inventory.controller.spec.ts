import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('InventoryController', () => {
  let controller: InventoryController;
  const inventoryService = {
    createMovement: vi.fn(),
    updateMovement: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryService, useValue: inventoryService },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: vi.fn() }, rolePermission: { findUnique: vi.fn() } },
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('associates a created movement with the authenticated user', async () => {
    const input = {
      eventUuid: '9d4c6c3e-01ed-4bd0-9f7c-00fb82fb7519',
      materialId: '4a0daacd-1639-42e5-b9f0-613139c286b8',
      movementType: 'PURCHASE',
      quantity: 3,
    };

    await controller.createMovement(input, {
      user: { sub: 'user-id', email: 'user@example.com' },
    });

    expect(inventoryService.createMovement).toHaveBeenCalledWith(input, 'user-id');
  });

  it('associates movement updates with the authenticated user', async () => {
    const input = { quantity: 2, reference: 'PO-123' };
    await controller.updateMovement(
      'movement-id',
      input,
      { user: { sub: 'editor-id', email: 'editor@example.com' } },
    );

    expect(inventoryService.updateMovement).toHaveBeenCalledWith(
      'movement-id',
      input,
      'editor-id',
    );
  });
});
