CREATE TYPE "PermissionAction" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE');

CREATE TABLE "RolePermission" (
    "role" "UserRole" NOT NULL,
    "module" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role", "module", "action")
);

CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

WITH role_modules ("role", "module", "actions") AS (
    VALUES
        ('ADMIN', 'dashboard', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'clients', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'projects', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'materials', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'inventory', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'production-orders', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'material-consumption', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'costs', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'audit-log', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'suppliers', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'purchase-orders', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'purchasing-reports', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'user-management', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ADMIN', 'receiving', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('GERENTE', 'dashboard', ARRAY['READ']),
        ('GERENTE', 'clients', ARRAY['READ']),
        ('GERENTE', 'projects', ARRAY['READ']),
        ('GERENTE', 'materials', ARRAY['READ']),
        ('GERENTE', 'inventory', ARRAY['READ']),
        ('GERENTE', 'production-orders', ARRAY['READ']),
        ('GERENTE', 'material-consumption', ARRAY['READ']),
        ('GERENTE', 'costs', ARRAY['READ']),
        ('GERENTE', 'audit-log', ARRAY['READ']),
        ('GERENTE', 'suppliers', ARRAY['READ']),
        ('GERENTE', 'purchase-orders', ARRAY['READ']),
        ('GERENTE', 'purchasing-reports', ARRAY['READ']),
        ('GERENTE', 'receiving', ARRAY['READ']),
        ('VENTAS', 'clients', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('VENTAS', 'projects', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ALMACEN', 'materials', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ALMACEN', 'inventory', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('ALMACEN', 'receiving', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('COMPRAS', 'suppliers', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('COMPRAS', 'purchase-orders', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('COMPRAS', 'purchasing-reports', ARRAY['READ']),
        ('PRODUCCION', 'production-orders', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('PRODUCCION', 'material-consumption', ARRAY['READ', 'CREATE', 'UPDATE', 'DELETE']),
        ('PRODUCCION', 'costs', ARRAY['READ'])
)
INSERT INTO "RolePermission" ("role", "module", "action")
SELECT role_modules."role"::"UserRole", role_modules."module", action::"PermissionAction"
FROM role_modules
CROSS JOIN LATERAL unnest(role_modules."actions") AS action;
