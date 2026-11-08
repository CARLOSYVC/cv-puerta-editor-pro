import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { handlePrismaError } from '../prisma/prisma-error.js';
import { CreateMaterialDto } from './dto/create-material.dto.js';
import { UpdateMaterialDto } from './dto/update-material.dto.js';
import {
  paginatedResult,
  type ListQueryDto,
} from '../common/list-query.dto.js';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.material.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findPaginated({ query, page, pageSize }: ListQueryDto) {
    const search = query?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
            { unit: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const total = await this.prisma.material.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.material.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  findOne(id: string) {
    return this.prisma.material
      .findUniqueOrThrow({ where: { id } })
      .catch(handlePrismaError);
  }

  create(input: CreateMaterialDto) {
    return this.prisma.material
      .create({ data: input })
      .catch(handlePrismaError);
  }

  update(id: string, input: UpdateMaterialDto) {
    return this.prisma.material
      .update({ where: { id }, data: input })
      .catch(handlePrismaError);
  }

  remove(id: string) {
    return this.prisma.material
      .delete({ where: { id } })
      .catch(handlePrismaError);
  }
}
