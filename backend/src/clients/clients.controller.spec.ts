import { Test, TestingModule } from '@nestjs/testing';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ClientsController', () => {
  let controller: ClientsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        { provide: ClientsService, useValue: {} },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: vi.fn() }, rolePermission: { findUnique: vi.fn() } },
        },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
