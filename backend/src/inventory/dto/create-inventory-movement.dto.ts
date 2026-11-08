import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InventoryMovementType } from '../../generated/prisma/enums.js';

export class CreateInventoryMovementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventUuid!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  materialId!: string;

  @ApiProperty({ enum: InventoryMovementType })
  @IsEnum(InventoryMovementType)
  movementType!: InventoryMovementType;

  @ApiProperty({ example: 10, description: 'Positive except for downward adjustments.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-999999999999.99)
  @Max(999999999999.99)
  quantity!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999999999.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  unitCost?: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
