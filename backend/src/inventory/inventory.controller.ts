import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
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
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto.js';
import { UpdateInventoryMovementDto } from './dto/update-inventory-movement.dto.js';
import { InventoryService } from './inventory.service.js';
import { ListQueryDto } from '../common/list-query.dto.js';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('movements')
  createMovement(
    @Body() input: CreateInventoryMovementDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.inventoryService.createMovement(input, request.user.sub);
  }

  @Get('movements')
  findMovements() {
    return this.inventoryService.findMovements();
  }

  @Get('movements/paginated')
  findPaginatedMovements(@Query() query: ListQueryDto) {
    return this.inventoryService.findMovementsPaginated(query);
  }

  @Patch('movements/:id')
  updateMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateInventoryMovementDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.inventoryService.updateMovement(id, input, request.user.sub);
  }

  @Get('stock')
  getStockLevels() {
    return this.inventoryService.getStockLevels();
  }

  @Get('stock/paginated')
  getPaginatedStockLevels(@Query() query: ListQueryDto) {
    return this.inventoryService.getStockLevelsPaginated(query);
  }

  @Get('materials/:id/stock')
  getMaterialStock(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getMaterialStock(id);
  }

  @Get('materials/:id/history')
  getMaterialHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getMaterialHistory(id);
  }
}
