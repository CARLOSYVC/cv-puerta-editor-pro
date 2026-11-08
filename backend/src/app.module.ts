import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { MaterialsModule } from './materials/materials.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { OperationsModule } from './production-orders/operations.module.js';
import { AuditLogModule } from './audit-log/audit-log.module.js';
import { PurchasingModule } from './purchasing/purchasing.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { GlobalSearchModule } from './search/global-search.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    ClientsModule,
    ProjectsModule,
    MaterialsModule,
    InventoryModule,
    OperationsModule,
    AuditLogModule,
    PurchasingModule,
    ReportsModule,
    GlobalSearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
