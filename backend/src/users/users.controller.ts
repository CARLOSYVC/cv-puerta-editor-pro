import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/enums.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ModuleAccess } from '../auth/module-access.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto.js';
import { ListQueryDto } from '../common/list-query.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@ModuleAccess('user-management')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('paginated')
  findPaginated(@Query() query: ListQueryDto) {
    return this.usersService.findPaginated(query);
  }

  @Get('permissions')
  findRolePermissions() {
    return this.usersService.findRolePermissions();
  }

  @Patch('permissions/:role')
  updateRolePermissions(
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
    @Body() input: UpdateRolePermissionsDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.usersService.updateRolePermissions(role, input, request.user.sub);
  }

  @Post()
  create(
    @Body() input: CreateUserDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.usersService.create(input, request.user.sub);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateUserRoleDto,
    @Req() request: Pick<AuthenticatedRequest, 'user'>,
  ) {
    return this.usersService.updateRole(id, input, request.user.sub);
  }
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class CurrentUserController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  findCurrent(@Req() request: Pick<AuthenticatedRequest, 'user'>) {
    return this.usersService.findCurrent(request.user.sub);
  }

  @Get('me/permissions')
  findCurrentPermissions(@Req() request: Pick<AuthenticatedRequest, 'user'>) {
    return this.usersService.findCurrentPermissionsForUser(request.user.sub);
  }
}
