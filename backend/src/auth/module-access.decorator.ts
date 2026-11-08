import { SetMetadata } from '@nestjs/common';

export type AccessModule =
  | 'dashboard'
  | 'clients'
  | 'projects'
  | 'materials'
  | 'inventory'
  | 'production-orders'
  | 'material-consumption'
  | 'costs'
  | 'audit-log'
  | 'suppliers'
  | 'purchase-orders'
  | 'purchasing-reports'
  | 'receiving'
  | 'user-management';

export const MODULE_ACCESS_KEY = 'module-access';

export function ModuleAccess(module: AccessModule) {
  return SetMetadata(MODULE_ACCESS_KEY, module);
}
