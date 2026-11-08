import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { handlePrismaError } from '../prisma/prisma-error.js';
import { PermissionAction, UserRole } from '../generated/prisma/enums.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto.js';
import { hash } from 'bcrypt';
import { paginatedResult, type ListQueryDto } from '../common/list-query.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findPaginated({ query, page, pageSize }: ListQueryDto) {
    const search = query?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const total = await this.prisma.user.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  async findCurrent(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findCurrentPermissions(role: UserRole) {
    return this.prisma.rolePermission.findMany({
      where: { role },
      select: { module: true, action: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  async findCurrentPermissionsForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.findCurrentPermissions(user.role);
  }

  async findRolePermissions() {
    const permissions = await this.prisma.rolePermission.findMany({
      select: { role: true, module: true, action: true },
      orderBy: [{ role: 'asc' }, { module: 'asc' }, { action: 'asc' }],
    });
    return Object.values(UserRole).map((role) => ({
      role,
      permissions: permissions
        .filter((permission) => permission.role === role)
        .map(({ module, action }) => ({ module, action })),
    }));
  }

  async updateRolePermissions(
    role: UserRole,
    input: UpdateRolePermissionsDto,
    actorId: string,
  ) {
    if (role === UserRole.ADMIN) {
      throw new BadRequestException('ADMIN permissions cannot be changed');
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const before = await transaction.rolePermission.findMany({
          where: { role },
          select: { module: true, action: true },
        });
        await transaction.rolePermission.deleteMany({ where: { role } });
        if (input.permissions.length > 0) {
          await transaction.rolePermission.createMany({
            data: input.permissions.map(({ module, action }) => ({
              role,
              module,
              action: action as PermissionAction,
            })),
          });
        }
        await this.auditLog.record(transaction, {
          userId: actorId,
          action: 'UPDATE',
          entity: 'RolePermission',
          entityId: role,
          before: { permissions: before },
          after: {
            permissions: input.permissions.map(({ module, action }) => ({ module, action })),
          },
        });
        return { role, permissions: input.permissions };
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async create(input: CreateUserDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            name: input.name.trim(),
            email: input.email.toLowerCase(),
            passwordHash: await hash(input.password, 12),
            role: input.role,
          },
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        await this.auditLog.record(transaction, {
          userId: actorId,
          action: 'CREATE',
          entity: 'User',
          entityId: user.id,
          after: { name: user.name, email: user.email, role: user.role },
        });
        return user;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }

  async updateRole(id: string, input: UpdateUserRoleDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "User" WHERE "role" = 'ADMIN'::"UserRole" FOR UPDATE
        `;
        const before = await transaction.user.findUnique({
          where: { id },
          select: { id: true, name: true, email: true, role: true },
        });
        if (!before) throw new NotFoundException('User not found');
        if (before.role === 'ADMIN' && input.role !== 'ADMIN') {
          const otherAdmins = await transaction.user.count({
            where: { role: 'ADMIN', id: { not: id } },
          });
          if (otherAdmins === 0) {
            throw new BadRequestException('At least one ADMIN account must remain');
          }
        }
        const updated = await transaction.user.update({
          where: { id },
          data: { role: input.role },
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        await this.auditLog.record(transaction, {
          userId: actorId,
          action: 'UPDATE',
          entity: 'User',
          entityId: updated.id,
          before: { role: before.role },
          after: { role: updated.role },
        });
        return updated;
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  }
}
