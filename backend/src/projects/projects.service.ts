import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { handlePrismaError } from '../prisma/prisma-error.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import {
  paginatedResult,
} from '../common/list-query.dto.js';
import type { ListProjectsQueryDto } from './dto/list-projects-query.dto.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.project.findMany({
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPaginated({ query, page, pageSize, clientId }: ListProjectsQueryDto) {
    const search = query?.trim();
    const where = {
      ...(clientId && { clientId }),
      ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
            { client: { name: { contains: search, mode: 'insensitive' as const } } },
            { client: { companyName: { contains: search, mode: 'insensitive' as const } } },
          ],
        }),
    };
    const total = await this.prisma.project.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.project.findMany({
      where,
      include: { client: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    return paginatedResult(items, total, currentPage, pageSize);
  }

  findOne(id: string) {
    return this.prisma.project
      .findUniqueOrThrow({ where: { id }, include: { client: true } })
      .catch(handlePrismaError);
  }

  create(input: CreateProjectDto) {
    return this.prisma.project
      .create({ data: input, include: { client: true } })
      .catch(handlePrismaError);
  }

  update(id: string, input: UpdateProjectDto) {
    return this.prisma.project
      .update({ where: { id }, data: input, include: { client: true } })
      .catch(handlePrismaError);
  }

  remove(id: string) {
    return this.prisma.project
      .delete({ where: { id } })
      .catch(handlePrismaError);
  }
}
