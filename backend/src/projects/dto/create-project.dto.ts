import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '../../generated/prisma/enums.js';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @ApiProperty({ example: 'Website redesign' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ProjectStatus, default: ProjectStatus.PLANNING })
  @IsEnum(ProjectStatus)
  status: ProjectStatus = ProjectStatus.PLANNING;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 999999999999.99, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  estimatedRevenue?: number;
}
