import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Operational workflows (integration)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let userId: string | undefined;
  let token: string;
  const fixture: Record<string, string> = {};

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) {
      throw new Error(
        'TEST_DATABASE_URL is required for operational E2E tests; do not point it at a development or production database.',
      );
    }
    process.env.DATABASE_URL = testDatabaseUrl;

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();

    prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: {
        name: 'Operational E2E',
        email: `operations-e2e-${randomUUID()}@example.test`,
        passwordHash: 'not-used-by-token-authentication',
        role: UserRole.ADMIN,
      },
      select: { id: true, email: true },
    });
    userId = user.id;
    token = await app.get(JwtService).signAsync({ sub: user.id, email: user.email });
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.inventoryMovement.deleteMany({ where: { createdById: userId } });
      if (fixture.purchaseOrderId) {
        await prisma.purchaseReceipt.deleteMany({
          where: { purchaseOrderId: fixture.purchaseOrderId },
        });
        await prisma.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: fixture.purchaseOrderId },
        });
        await prisma.purchaseOrder.deleteMany({
          where: { id: fixture.purchaseOrderId },
        });
      }
      if (fixture.productionOrderId) {
        await prisma.productionOrder.deleteMany({
          where: { id: fixture.productionOrderId },
        });
      }
      if (fixture.projectId) {
        await prisma.project.deleteMany({ where: { id: fixture.projectId } });
      }
      if (fixture.materialId) {
        await prisma.material.deleteMany({ where: { id: fixture.materialId } });
      }
      if (fixture.supplierId) {
        await prisma.supplier.deleteMany({ where: { id: fixture.supplierId } });
      }
      if (fixture.clientId) {
        await prisma.client.deleteMany({ where: { id: fixture.clientId } });
      }
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await app?.close();
  });

  it('runs client-to-production and supplier-to-receiving-to-cost flows', async () => {
    const server = () => request(app!.getHttpServer());
    const auth = { Authorization: `Bearer ${token}` };
    const before = await server()
      .get('/dashboard/executive-metrics')
      .set(auth)
      .expect(200);

    const clientResponse = await server()
      .post('/clients')
      .set(auth)
      .send({ name: `E2E client ${randomUUID()}` })
      .expect(201);
    const clientId = clientResponse.body.id as string;
    fixture.clientId = clientId;

    const projectResponse = await server()
      .post('/projects')
      .set(auth)
      .send({
        name: `E2E project ${randomUUID()}`,
        clientId,
        estimatedRevenue: 1000,
      })
      .expect(201);
    const projectId = projectResponse.body.id as string;
    fixture.projectId = projectId;

    const supplierResponse = await server()
      .post('/suppliers')
      .set(auth)
      .send({ name: `E2E supplier ${randomUUID()}` })
      .expect(201);
    fixture.supplierId = supplierResponse.body.id as string;

    const materialResponse = await server()
      .post('/materials')
      .set(auth)
      .send({
        name: `E2E material ${randomUUID()}`,
        unit: 'unit',
        unitCost: 10,
        minimumStock: 1,
      })
      .expect(201);
    const materialId = materialResponse.body.id as string;
    fixture.materialId = materialId;

    const purchaseOrderResponse = await server()
      .post('/purchase-orders')
      .set(auth)
      .send({
        supplierId: supplierResponse.body.id,
        items: [{ materialId, quantity: 10, unitCost: 15 }],
      })
      .expect(201);
    const purchaseOrderId = purchaseOrderResponse.body.id as string;
    fixture.purchaseOrderId = purchaseOrderId;
    const purchaseOrderItemId = purchaseOrderResponse.body.items[0].id as string;

    await server()
      .patch(`/purchase-orders/${purchaseOrderId}/status`)
      .set(auth)
      .send({ status: 'ORDERED' })
      .expect(200);

    const partialReceipt = await server()
      .post(`/receiving/orders/${purchaseOrderId}/receipts`)
      .set(auth)
      .send({
        reference: 'E2E partial receipt',
        items: [{ purchaseOrderItemId, quantity: 4, actualUnitCost: 20 }],
      })
      .expect(201);
    expect(partialReceipt.body.purchaseOrder.status).toBe('PARTIALLY_RECEIVED');
    expect(Number((await prisma!.material.findUniqueOrThrow({
      where: { id: materialId },
      select: { unitCost: true },
    })).unitCost)).toBe(20);

    const finalReceipt = await server()
      .post(`/receiving/orders/${purchaseOrderId}/receipts`)
      .set(auth)
      .send({
        reference: 'E2E final receipt',
        items: [{ purchaseOrderItemId, quantity: 6, actualUnitCost: 30 }],
      })
      .expect(201);
    expect(finalReceipt.body.purchaseOrder.status).toBe('RECEIVED');
    expect(Number((await prisma!.material.findUniqueOrThrow({
      where: { id: materialId },
      select: { unitCost: true },
    })).unitCost)).toBe(26);

    const productionOrderResponse = await server()
      .post('/production-orders')
      .set(auth)
      .send({
        name: `E2E production ${randomUUID()}`,
        projectId,
      })
      .expect(201);
    const productionOrderId = productionOrderResponse.body.id as string;
    fixture.productionOrderId = productionOrderId;

    const consumption = await server()
      .post('/material-consumption')
      .set(auth)
      .send({ productionOrderId, materialId, quantity: 2 })
      .expect(201);
    expect(Number(consumption.body.unitCost)).toBe(26);
    expect(Number(consumption.body.quantity) * Number(consumption.body.unitCost)).toBe(52);

    const stock = await server()
      .get(`/inventory/materials/${materialId}/stock`)
      .set(auth)
      .expect(200);
    expect(Number(stock.body.stock)).toBe(8);

    const costs = await server().get('/costs').set(auth).expect(200);
    const productionCostEntry = costs.body.entries.find(
      (entry: { productionOrderId: string }) => entry.productionOrderId === productionOrderId,
    );
    expect(Number(productionCostEntry?.unitCost)).toBe(26);
    expect(Number(productionCostEntry?.totalCost)).toBe(52);

    const after = await server()
      .get('/dashboard/executive-metrics')
      .set(auth)
      .expect(200);
    const estimatedSales = Number(after.body.estimatedSales);
    const productionCost = Number(after.body.productionCost);
    const estimatedProfit = Number(after.body.estimatedProfit);
    expect(estimatedSales - Number(before.body.estimatedSales)).toBe(1000);
    expect(productionCost - Number(before.body.productionCost)).toBe(52);
    expect(estimatedProfit - Number(before.body.estimatedProfit)).toBe(948);
    expect(Number(after.body.estimatedMargin)).toBeCloseTo(
      estimatedSales > 0 ? (estimatedProfit / estimatedSales) * 100 : 0,
      2,
    );
  });
});
