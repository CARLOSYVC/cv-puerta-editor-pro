import {
  Body,
  Controller,
  Delete,
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
import { CreateMaterialConsumptionDto } from './dto/create-material-consumption.dto.js';
import { CreateProductionOrderDto } from './dto/create-production-order.dto.js';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto.js';
import { OperationsService } from './operations.service.js';
import { ListQueryDto } from '../common/list-query.dto.js';

@ApiTags('production-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('production-orders')
@Controller('production-orders')
export class ProductionOrdersController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  findAll() {
    return this.operations.findProductionOrders();
  }

  @Get('paginated')
  findPaginated(@Query() query: ListQueryDto) {
    return this.operations.findProductionOrdersPaginated(query);
  }

  @Post()
  create(
    @Body() input: CreateProductionOrderDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.operations.createProductionOrder(input, request.user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProductionOrderDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.operations.updateProductionOrder(id, input, request.user.sub);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.operations.deleteProductionOrder(id, request.user.sub);
  }
}

@ApiTags('material-consumption')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('material-consumption')
@Controller('material-consumption')
export class MaterialConsumptionController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  findAll() {
    return this.operations.findMaterialConsumptions();
  }

  @Get('paginated')
  findPaginated(@Query() query: ListQueryDto) {
    return this.operations.findMaterialConsumptionsPaginated(query);
  }

  @Post()
  create(
    @Body() input: CreateMaterialConsumptionDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.operations.createMaterialConsumption(input, request.user.sub);
  }
}

@ApiTags('costs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('costs')
@Controller('costs')
export class CostsController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  findAll() {
    return this.operations.getCosts();
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly operations: OperationsService) {}

  @Get('metrics')
  getMetrics() {
    return this.operations.getDashboardMetrics();
  }

  @Get('executive-metrics')
  getExecutiveMetrics() {
    return this.operations.getExecutiveDashboardMetrics();
  }
}
