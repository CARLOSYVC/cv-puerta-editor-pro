import { PartialType } from '@nestjs/swagger';
import { CreateProductionOrderDto } from './create-production-order.dto.js';

export class UpdateProductionOrderDto extends PartialType(
  CreateProductionOrderDto,
) {}
