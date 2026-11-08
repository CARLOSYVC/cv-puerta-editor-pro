import { Injectable, NotFoundException } from '@nestjs/common';
import { PermissionAction } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type SearchModule =
  | 'clients'
  | 'projects'
  | 'materials'
  | 'suppliers'
  | 'purchase-orders'
  | 'production-orders';

export interface GlobalSearchResult {
  id: string;
  entity: string;
  label: string;
  detail: string;
  module: SearchModule;
}

@Injectable()
export class GlobalSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, userId: string): Promise<GlobalSearchResult[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const grants = await this.prisma.rolePermission.findMany({
      where: { role: user.role, action: PermissionAction.READ },
      select: { module: true },
    });
    const permitted = new Set(grants.map(({ module }) => module));
    const term = query.trim();
    const contains = { contains: term, mode: 'insensitive' as const };
    const searches: Promise<GlobalSearchResult[]>[] = [];

    if (permitted.has('clients')) {
      searches.push(
        this.prisma.client
          .findMany({
            where: {
              OR: [
                { name: contains },
                { companyName: contains },
                { email: contains },
                { phone: contains },
              ],
            },
            select: { id: true, name: true, companyName: true, email: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: 5,
          })
          .then((items) =>
            items.map((item) => ({
              id: item.id,
              entity: 'Cliente',
              label: item.name,
              detail: item.companyName ?? item.email ?? 'Cliente',
              module: 'clients' as const,
            })),
          ),
      );
    }

    if (permitted.has('projects')) {
      searches.push(
        this.prisma.project
          .findMany({
            where: {
              OR: [
                { name: contains },
                { description: contains },
                { client: { name: contains } },
                { client: { companyName: contains } },
              ],
            },
            select: { id: true, name: true, client: { select: { name: true } } },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
            take: 5,
          })
          .then((items) =>
            items.map((item) => ({
              id: item.id,
              entity: 'Proyecto',
              label: item.name,
              detail: item.client.name,
              module: 'projects' as const,
            })),
          ),
      );
    }

    if (permitted.has('materials')) {
      searches.push(
        this.prisma.material
          .findMany({
            where: {
              OR: [{ name: contains }, { description: contains }, { unit: contains }],
            },
            select: { id: true, name: true, unit: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: 5,
          })
          .then((items) =>
            items.map((item) => ({
              id: item.id,
              entity: 'Material',
              label: item.name,
              detail: `Unidad: ${item.unit}`,
              module: 'materials' as const,
            })),
          ),
      );
    }

    if (permitted.has('suppliers')) {
      searches.push(
        this.prisma.supplier
          .findMany({
            where: {
              OR: [
                { name: contains },
                { companyName: contains },
                { email: contains },
                { phone: contains },
              ],
            },
            select: { id: true, name: true, companyName: true, email: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: 5,
          })
          .then((items) =>
            items.map((item) => ({
              id: item.id,
              entity: 'Proveedor',
              label: item.name,
              detail: item.companyName ?? item.email ?? 'Proveedor',
              module: 'suppliers' as const,
            })),
          ),
      );
    }

    if (permitted.has('purchase-orders')) {
      searches.push(
        this.prisma.purchaseOrder
          .findMany({
            where: {
              OR: [
                { id: { contains: term, mode: 'insensitive' } },
                { supplier: { name: contains } },
                { supplier: { companyName: contains } },
              ],
            },
            select: {
              id: true,
              status: true,
              supplier: { select: { name: true } },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: 5,
          })
          .then((items) =>
            items.map((item) => ({
              id: item.id,
              entity: 'Orden de compra',
              label: `OC ${item.id.slice(0, 8)}`,
              detail: `${item.supplier.name} · ${item.status}`,
              module: 'purchase-orders' as const,
            })),
          ),
      );
    }

    if (permitted.has('production-orders')) {
      searches.push(
        this.prisma.productionOrder
          .findMany({
            where: {
              OR: [
                { name: contains },
                { description: contains },
                { project: { name: contains } },
              ],
            },
            select: {
              id: true,
              name: true,
              status: true,
              project: { select: { name: true } },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: 5,
          })
          .then((items) =>
            items.map((item) => ({
              id: item.id,
              entity: 'Orden de producción',
              label: item.name,
              detail: `${item.project.name} · ${item.status}`,
              module: 'production-orders' as const,
            })),
          ),
      );
    }

    const groupedResults = await Promise.all(searches);
    return groupedResults.flat().slice(0, 20);
  }
}
