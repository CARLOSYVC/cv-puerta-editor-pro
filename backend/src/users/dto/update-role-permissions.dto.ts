import { ApiProperty } from '@nestjs/swagger';
import { PermissionAction } from '../../generated/prisma/enums.js';
import { ArrayUnique, IsArray, IsEnum, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { accessModules } from '../../auth/permissions.js';

class PermissionGrantDto {
  @ApiProperty({ enum: accessModules })
  @IsString()
  @IsIn(accessModules)
  module!: string;

  @ApiProperty({ enum: PermissionAction })
  @IsEnum(PermissionAction)
  action!: PermissionAction;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [PermissionGrantDto] })
  @IsArray()
  @ArrayUnique((permission: PermissionGrantDto) => `${permission.module}:${permission.action}`)
  @ValidateNested({ each: true })
  @Type(() => PermissionGrantDto)
  permissions!: PermissionGrantDto[];
}
