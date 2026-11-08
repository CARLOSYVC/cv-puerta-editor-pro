import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { handlePrismaError } from '../prisma/prisma-error.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { ListClientsQueryDto } from './dto/list-clients-query.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findPaginated({ query, page, pageSize }: ListClientsQueryDto) {
    const search = query?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { companyName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { notes: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const total = await this.prisma.client.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await this.prisma.client.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      include: {
        projects: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
          take: 3,
        },
        _count: { select: { projects: true } },
      },
    });

    return { items, total, page: currentPage, pageSize, totalPages };
  }

  findOne(id: string) {
    return this.prisma.client.findUniqueOrThrow({ where: { id } }).catch(handlePrismaError);
  }

  create(input: CreateClientDto) {
    return this.prisma.client.create({ data: input }).catch(handlePrismaError);
  }

  update(id: string, input: UpdateClientDto) {
    return this.prisma.client.update({ where: { id }, data: input }).catch(handlePrismaError);
  }

  remove(id: string) {
    return this.prisma.client.delete({ where: { id } }).catch(handlePrismaError);
  }
}
