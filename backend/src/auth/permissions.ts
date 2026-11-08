import { PermissionAction, UserRole } from '../generated/prisma/enums.js';
import type { AccessModule } from './module-access.decorator.js';

export const accessModules: readonly AccessModule[] = [
  'dashboard',
  'clients',
  'projects',
  'materials',
  'inventory',
  'production-orders',
  'material-consumption',
  'costs',
  'audit-log',
  'suppliers',
  'purchase-orders',
  'purchasing-reports',
  'user-management',
  'receiving',
];

export const permissionActions = Object.values(PermissionAction);

export interface PermissionGrant {
  module: AccessModule;
  action: PermissionAction;
}

export const defaultRolePermissions: Record<UserRole, PermissionGrant[]> = {
  [UserRole.ADMIN]: accessModules.flatMap((module) =>
    permissionActions.map((action) => ({ module, action })),
  ),
  [UserRole.GERENTE]: accessModules
    .filter((module) => module !== 'user-management')
    .map((module) => ({ module, action: PermissionAction.READ })),
  [UserRole.VENTAS]: ['clients', 'projects'].flatMap((module) =>
    permissionActions.map((action) => ({ module: module as AccessModule, action })),
  ),
  [UserRole.ALMACEN]: (['materials', 'inventory', 'receiving'] as const).flatMap(
    (module) => permissionActions.map((action) => ({ module, action })),
  ),
  [UserRole.COMPRAS]: (
    ['suppliers', 'purchase-orders', 'purchasing-reports'] as const
  ).flatMap((module) =>
    permissionActions
      .filter((action) => module !== 'purchasing-reports' || action === PermissionAction.READ)
      .map((action) => ({ module, action })),
  ),
  [UserRole.PRODUCCION]: [
    ...(['production-orders', 'material-consumption'] as const).flatMap((module) =>
      permissionActions.map((action) => ({ module, action })),
    ),
    { module: 'costs', action: PermissionAction.READ },
  ],
};
