import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../generated/prisma/enums.js';
import { IsEnum } from 'class-validator';

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({ enum: PurchaseOrderStatus })
  @IsEnum(PurchaseOrderStatus)
  status!: PurchaseOrderStatus;
}
