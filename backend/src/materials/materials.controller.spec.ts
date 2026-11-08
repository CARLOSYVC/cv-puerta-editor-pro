import { Test, TestingModule } from '@nestjs/testing';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('MaterialsController', () => {
  let controller: MaterialsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [
        { provide: MaterialsService, useValue: {} },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: vi.fn() }, rolePermission: { findUnique: vi.fn() } },
        },
      ],
    }).compile();

    controller = module.get<MaterialsController>(MaterialsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
