import { lazy, Suspense, useEffect, useState } from 'react'
import {
  getCurrentPermissions,
  getCurrentUser,
  roleLabels,
  type UserRole,
} from './services/users'
import { GlobalSearch } from './global-search/GlobalSearch'
import type { GlobalSearchModule } from './services/global-search'
import {
  hasPermission,
  type AccessModule,
  type PermissionGrant,
} from './services/permissions'
import './App.css'

const InventoryPage = lazy(() =>
  import('./inventory/InventoryPage').then((module) => ({
    default: module.InventoryPage,
  })),
)
const CostsPage = lazy(() =>
  import('./costs/CostsPage').then((module) => ({
    default: module.CostsPage,
  })),
)
const MaterialConsumptionPage = lazy(() =>
  import('./material-consumption/MaterialConsumptionPage').then((module) => ({
    default: module.MaterialConsumptionPage,
  })),
)
const MaterialsPage = lazy(() =>
  import('./materials/MaterialsPage').then((module) => ({
    default: module.MaterialsPage,
  })),
)
const ProductionOrdersPage = lazy(() =>
  import('./production-orders/ProductionOrdersPage').then((module) => ({
    default: module.ProductionOrdersPage,
  })),
)
const DashboardMetrics = lazy(() =>
  import('./dashboard/DashboardMetrics').then((module) => ({
    default: module.DashboardMetrics,
  })),
)
const ProjectsPage = lazy(() =>
  import('./projects/ProjectsPage').then((module) => ({
    default: module.ProjectsPage,
  })),
)
const AuditLogPage = lazy(() =>
  import('./audit-log/AuditLogPage').then((module) => ({
    default: module.AuditLogPage,
  })),
)
const SuppliersPage = lazy(() =>
  import('./suppliers/SuppliersPage').then((module) => ({
    default: module.SuppliersPage,
  })),
)
const PurchaseOrdersPage = lazy(() =>
  import('./purchase-orders/PurchaseOrdersPage').then((module) => ({
    default: module.PurchaseOrdersPage,
  })),
)
const PurchasingReportsPage = lazy(() =>
  import('./purchasing-reports/PurchasingReportsPage').then((module) => ({
    default: module.PurchasingReportsPage,
  })),
)
const UserManagementPage = lazy(() =>
  import('./users/UserManagementPage').then((module) => ({
    default: module.UserManagementPage,
  })),
)
const ReceivingPage = lazy(() =>
  import('./receiving/ReceivingPage').then((module) => ({
    default: module.ReceivingPage,
  })),
)
const ClientsPage = lazy(() =>
  import('./clients/ClientsPage').then((module) => ({
    default: module.ClientsPage,
  })),
)

const modules = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'A clear overview of your production workspace.',
  },
  {
    id: 'clients',
    label: 'Clientes',
    description: 'Registra clientes y administra sus datos de contacto.',
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Organize client projects and keep work moving.',
  },
  {
    id: 'production-orders',
    label: 'Orden Producción',
    description: 'Plan and follow production work from start to finish.',
  },
  {
    id: 'material-consumption',
    label: 'Consumo',
    description: 'Record material usage against production orders.',
  },
  { id: 'inventory', label: 'Inventario', description: 'Consulta existencias y registra movimientos.' },
  { id: 'materials', label: 'Materiales', description: 'Administra el catálogo y los mínimos de stock.' },
  {
    id: 'suppliers',
    label: 'Proveedores',
    description: 'Manage supplier contacts and purchasing relationships.',
  },
  {
    id: 'purchase-orders',
    label: 'Compras',
    description: 'Create purchase orders and manage supplier deliveries.',
  },
  {
    id: 'receiving',
    label: 'Recepciones',
    description: 'Register deliveries against open purchase orders.',
  },
  {
    id: 'costs',
    label: 'Costos',
    description: 'Review the costs associated with your operations.',
  },
  {
    id: 'reports',
    label: 'Reportes',
    description: 'Review purchase spending by supplier and material.',
  },
  {
    id: 'audit-log',
    label: 'Audit Log',
    description: 'Review the history of inventory and production order changes.',
  },
  {
    id: 'user-management',
    label: 'Users & Roles',
    description: 'Assign workspace roles and manage access.',
  },
] as const

type ModuleId = (typeof modules)[number]['id']

function canAccessModule(
  permissions: readonly PermissionGrant[],
  moduleId: ModuleId,
): boolean {
  const accessModule: AccessModule = moduleId === 'reports'
    ? 'purchasing-reports'
    : moduleId
  return hasPermission(permissions, accessModule, 'READ')
}

function getInitialModule(): ModuleId {
  const hash = window.location.hash.slice(1)
  return modules.find((module) => module.id === hash)?.id ?? 'dashboard'
}

function ModuleIcon({ id }: { id: ModuleId }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.7,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...common}>
      {id === 'dashboard' && (
        <>
          <path d="M4 19V5M4 19h16" />
          <path d="m7 15 4-4 3 2 5-6" />
        </>
      )}
      {id === 'suppliers' && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1" />
        </>
      )}
      {id === 'purchase-orders' && (
        <>
          <path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h3" />
          <path d="m15 15 2 2 4-5" />
        </>
      )}
      {id === 'receiving' && (
        <>
          <path d="M3 7h12v11H3zM15 11h4l3 3v4h-7z" />
          <circle cx="7.5" cy="19" r="1.5" />
          <circle cx="18.5" cy="19" r="1.5" />
          <path d="m8 11 2.5 2.5L15 9" />
        </>
      )}
      {id === 'reports' && (
        <>
          <path d="M4 20V4M4 20h17" />
          <path d="m7 16 4-5 3 2 6-7" />
        </>
      )}
      {id === 'user-management' && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-1a6 6 0 0 1 12 0v1M17 8h4M19 6v4M17 16h4M17 20h4" />
        </>
      )}
      {id === 'projects' && (
        <>
          <rect x="4" y="5" width="13" height="15" rx="2" />
          <path d="M8 9h5M8 13h5M8 16h3M17 8h3v11a1 1 0 0 1-1 1" />
        </>
      )}
      {id === 'materials' && (
        <>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21" />
        </>
      )}
      {id === 'inventory' && (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </>
      )}
      {id === 'production-orders' && (
        <>
          <rect x="5" y="5" width="14" height="16" rx="2" />
          <path d="M9 5V3h6v2M9 11h6M9 15h6M9 18h3" />
        </>
      )}
      {id === 'material-consumption' && (
        <>
          <path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3" />
          <path d="M8 15h8M10 12h4" />
        </>
      )}
      {id === 'costs' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M15 8.5c-.6-.8-1.6-1.2-3-1.2-1.7 0-2.8.8-2.8 2s1 1.8 2.8 2.2 2.8 1 2.8 2.2-1.2 2-2.8 2c-1.3 0-2.4-.5-3-1.4M12 5.5v13" />
        </>
      )}
      {id === 'audit-log' && (
        <>
          <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
          <path d="m16 16 1.5 1.5L21 14" />
        </>
      )}
    </svg>
  )
}

function App() {
  const [activeId, setActiveId] = useState<ModuleId>(getInitialModule)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [role, setRole] = useState<UserRole | null>(
    () => sessionStorage.getItem('user_role') as UserRole | null,
  )
  const [permissions, setPermissions] = useState<PermissionGrant[]>([])
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [accessError, setAccessError] = useState('')
  const activeModule = modules.find((module) => module.id === activeId)!
  const token = sessionStorage.getItem('access_token')
  const visibleModules = token && role && permissionsLoaded
    ? modules.filter((module) => canAccessModule(permissions, module.id))
    : token
      ? []
      : modules.filter((module) => module.id !== 'user-management')

  useEffect(() => {
    async function syncRole() {
      const currentToken = sessionStorage.getItem('access_token')
      if (!currentToken) {
        setRole(null)
        setPermissions([])
        setPermissionsLoaded(true)
        setAccessError('')
        sessionStorage.removeItem('user_role')
        sessionStorage.removeItem('user_id')
        sessionStorage.removeItem('user_permissions')
        return
      }
      setPermissionsLoaded(false)
      setAccessError('')
      try {
        const user = await getCurrentUser()
        const currentPermissions = await getCurrentPermissions()
        sessionStorage.setItem('user_role', user.role)
        sessionStorage.setItem('user_id', user.id)
        sessionStorage.setItem('user_permissions', JSON.stringify(currentPermissions))
        setRole(user.role)
        setPermissions(currentPermissions)
        setPermissionsLoaded(true)
        const currentModule = window.location.hash.slice(1) as ModuleId
        if (!canAccessModule(currentPermissions, currentModule)) {
          const firstModule = modules.find((module) =>
            canAccessModule(currentPermissions, module.id),
          )?.id ?? 'dashboard'
          setActiveId(firstModule)
          window.location.hash = firstModule
        }
      } catch (cause: unknown) {
        sessionStorage.removeItem('user_role')
        sessionStorage.removeItem('user_permissions')
        setRole(null)
        setPermissions([])
        setPermissionsLoaded(true)
        setAccessError(
          cause instanceof Error
            ? cause.message
            : 'No se pudieron cargar el usuario y sus permisos. Comprueba la conexión y las migraciones de la base de datos.',
        )
      }
    }

    function syncModuleFromHash() {
      setActiveId(getInitialModule())
    }

    function syncAuth() {
      void syncRole()
    }
    void syncRole()
    window.addEventListener('hashchange', syncModuleFromHash)
    window.addEventListener('auth-changed', syncAuth)
    return () => {
      window.removeEventListener('hashchange', syncModuleFromHash)
      window.removeEventListener('auth-changed', syncAuth)
    }
  }, [])

  function navigateTo(id: ModuleId) {
    setActiveId(id)
    setMobileNavOpen(false)
  }

  return (
    <div className="app-shell">
      {mobileNavOpen && (
        <button
          aria-label="Close navigation"
          className="mobile-backdrop"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside className={`sidebar${mobileNavOpen ? ' sidebar-open' : ''}`}>
        <a className="brand" href="#dashboard" onClick={() => navigateTo('dashboard')}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M5 25V7l11 12L27 7v18" />
              <path d="M10 25V17m12 8v-8" />
            </svg>
          </span>
          <span className="brand-copy">
            <strong>Puerta</strong>
            <span>Operations</span>
          </span>
        </a>

        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation" className="primary-nav">
          {visibleModules.map((module) => (
            <a
              aria-current={activeId === module.id ? 'page' : undefined}
              className={`nav-link${activeId === module.id ? ' nav-link-active' : ''}`}
              href={`#${module.id}`}
              key={module.id}
              onClick={() => navigateTo(module.id)}
            >
              <span className="nav-icon">
                <ModuleIcon id={module.id} />
              </span>
              <span>{module.label}</span>
              {module.id === 'dashboard' && activeId === module.id && (
                <span aria-hidden="true" className="active-indicator" />
              )}
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="workspace-card">
            <span aria-hidden="true" className="workspace-dot" />
            <div>
              <strong>Production workspace</strong>
              <span>Business operations</span>
            </div>
          </div>
          <div className="sidebar-footer">PUERTA · OPERATIONS</div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            aria-expanded={mobileNavOpen}
            aria-label="Toggle navigation"
            className="menu-toggle"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span aria-hidden="true" className="breadcrumb-separator">/</span>
            <strong>{activeModule.label}</strong>
          </div>
          {token && permissionsLoaded && (
            <GlobalSearch
              onNavigate={(module: GlobalSearchModule, query: string) => {
                if (!visibleModules.some((item) => item.id === module)) return
                sessionStorage.setItem('global_search_query', query)
                navigateTo(module)
                window.location.hash = module
              }}
            />
          )}
          <div className="topbar-right">
            <span className="status-dot" />
            <span>{role ? roleLabels[role] : 'Workspace'}</span>
            <span aria-hidden="true" className="avatar">P</span>
          </div>
        </header>

        <main className={`page-content${role === 'GERENTE' ? ' role-readonly' : ''}`}>
          <Suspense
            fallback={
              <div className="projects-state" role="status">
                Cargando módulo…
              </div>
            }
          >
          {token && (!role || !permissionsLoaded) ? (
            accessError ? (
              <div className="projects-state projects-page-error" role="alert">{accessError}</div>
            ) : (
              <div className="projects-state" role="status">Verificando acceso…</div>
            )
          ) : token && !canAccessModule(permissions, activeId) ? (
            <section className="projects-page">
              <div className="page-heading"><div><div className="eyebrow">ACCESO</div><h1>Acceso restringido</h1><p>Tu rol no tiene permisos para este módulo.</p></div></div>
              <div className="projects-state projects-empty-state"><p>Contacta a un administrador si necesitas acceso.</p></div>
            </section>
          ) : activeId === 'user-management' ? (
            <UserManagementPage />
          ) : activeId === 'clients' ? (
            <ClientsPage />
          ) : activeId === 'materials' ? (
            <MaterialsPage />
          ) : activeId === 'inventory' ? (
            <InventoryPage />
          ) : activeId === 'projects' ? (
            <ProjectsPage />
          ) : activeId === 'production-orders' ? (
            <ProductionOrdersPage />
          ) : activeId === 'material-consumption' ? (
            <MaterialConsumptionPage />
          ) : activeId === 'costs' ? (
            <CostsPage />
          ) : activeId === 'audit-log' ? (
            <AuditLogPage />
          ) : activeId === 'suppliers' ? (
            <SuppliersPage />
          ) : activeId === 'purchase-orders' ? (
            <PurchaseOrdersPage />
          ) : activeId === 'receiving' ? (
            <ReceivingPage />
          ) : activeId === 'reports' ? (
            <PurchasingReportsPage />
          ) : activeId === 'dashboard' ? (
            <section aria-labelledby="page-title" className="dashboard-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">OVERVIEW</div>
                  <h1 id="page-title">Welcome to Puerta</h1>
                  <p>Your operations workspace, all in one place.</p>
                </div>
                <span className="date-chip">Operations workspace</span>
              </div>

              <div className="welcome-panel">
                <div className="welcome-copy">
                  <span className="welcome-kicker">YOUR WORKSPACE</span>
                  <h2>Make every part of production work together.</h2>
                  <p>
                    Choose a module to get started. Your workspace is ready to
                    grow with your operation.
                  </p>
                </div>
                <div aria-hidden="true" className="welcome-art">
                  <div className="art-ring art-ring-outer" />
                  <div className="art-ring art-ring-inner" />
                  <div className="art-center">
                    <svg viewBox="0 0 48 48" fill="none">
                      <path d="M8 35V13l16 17 16-17v22" />
                      <path d="M15 35V25m18 10V25" />
                    </svg>
                  </div>
                  <span className="art-node art-node-one" />
                  <span className="art-node art-node-two" />
                  <span className="art-node art-node-three" />
                </div>
              </div>

              <DashboardMetrics />

              <div className="section-heading">
                <div>
                  <h2>Workspace modules</h2>
                  <p>Navigate to a module to continue.</p>
                </div>
                <span className="module-count">
                  {String(visibleModules.filter((module) => module.id !== 'dashboard').length).padStart(2, '0')} MODULES
                </span>
              </div>

              <div className="module-grid">
                {visibleModules
                  .filter((module) => module.id !== 'dashboard')
                  .map((module, index) => (
                    <a
                      className="module-card"
                      href={`#${module.id}`}
                      key={module.id}
                      onClick={() => navigateTo(module.id)}
                    >
                      <span className={`module-card-icon module-card-icon-${index}`}>
                        <ModuleIcon id={module.id} />
                      </span>
                      <span className="module-card-title">{module.label}</span>
                      <span className="module-card-description">{module.description}</span>
                      <span aria-hidden="true" className="module-card-arrow">↗</span>
                    </a>
                  ))}
              </div>
            </section>
          ) : (
            <section aria-labelledby="page-title" className="module-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">WORKSPACE MODULE</div>
                  <h1 id="page-title">{activeModule.label}</h1>
                  <p>{activeModule.description}</p>
                </div>
              </div>
              <div className="empty-state">
                <span className="empty-state-icon">
                  <ModuleIcon id={activeId} />
                </span>
                <h2>{activeModule.label}</h2>
                <p>
                  This module is in the workspace navigation. Its workflows can
                  be added here next.
                </p>
              </div>
            </section>
          )}
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default App
