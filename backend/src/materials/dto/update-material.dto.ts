import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateMaterialDto } from './create-material.dto.js';

export class UpdateMaterialDto extends PartialType(
  OmitType(CreateMaterialDto, ['unitCost'] as const),
) {}
