import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/enums.js';
import { IsEnum } from 'class-validator';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}
