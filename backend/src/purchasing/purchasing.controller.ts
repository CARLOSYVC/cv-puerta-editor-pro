import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ModuleAccess } from '../auth/module-access.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { PurchasingService } from './purchasing.service.js';
import { ListQueryDto } from '../common/list-query.dto.js';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  findAll() {
    return this.purchasing.findSuppliers();
  }

  @Get('paginated')
  findPaginated(@Query() query: ListQueryDto) {
    return this.purchasing.findSuppliersPaginated(query);
  }

  @Post()
  create(
    @Body() input: CreateSupplierDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.purchasing.createSupplier(input, request.user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateSupplierDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.purchasing.updateSupplier(id, input, request.user.sub);
  }
}

@ApiTags('purchase-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  findAll() {
    return this.purchasing.findPurchaseOrders();
  }

  @Get('paginated')
  findPaginated(@Query() query: ListQueryDto) {
    return this.purchasing.findPurchaseOrdersPaginated(query);
  }

  @Post()
  create(
    @Body() input: CreatePurchaseOrderDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.purchasing.createPurchaseOrder(input, request.user.sub);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdatePurchaseOrderStatusDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.purchasing.updatePurchaseOrderStatus(
      id,
      input,
      request.user.sub,
    );
  }

}

@ApiTags('receiving')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('receiving')
@Controller('receiving/orders')
export class ReceivingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  findReceivableOrders() {
    return this.purchasing.findReceivableOrders();
  }

  @Post(':id/receipts')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReceivePurchaseOrderDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.purchasing.receivePurchaseOrder(
      id,
      input,
      request.user.sub,
    );
  }
}

@ApiTags('purchasing-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('purchasing-reports')
@Controller('purchasing')
export class PurchasingReportsController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get('metrics')
  getMetrics() {
    return this.purchasing.getMetrics();
  }

  @Get('reports')
  getReport() {
    return this.purchasing.getReport();
  }
}
