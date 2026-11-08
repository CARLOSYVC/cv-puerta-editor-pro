# Puerta Operations v1.0.0-rc.1

First release candidate for the Puerta Operations workflow.

## Included

- Role-based CRUD permissions managed by administrators and enforced by the API.
- Inventory, purchasing, receiving, production, consumption, and cost workflows.
- Weighted-average material costs and historical consumption costing.
- Executive sales, production-cost, estimated-profit, and margin KPIs.
- XLSX and PDF exports for operational and executive reports.
- Searchable, filterable, paginated audit history with CSV, XLSX, and PDF export.
- An operational integration test covering purchasing, partial receiving,
  inventory, production consumption, historical cost, and profit KPIs.

## Verification

- Backend: build, lint, 74 unit tests, and 3 smoke E2E tests pass.
- Operational workflow test passes against an isolated PostgreSQL test database.
- Frontend: production build and lint pass.

## Release checks

- Apply database migrations with `npx prisma migrate deploy` before starting
  the application. This release adds persisted role permissions.
- Configure production `DATABASE_URL`, `JWT_SECRET`, and `FRONTEND_ORIGINS`.
- Run operational E2E tests only against a dedicated `TEST_DATABASE_URL`.
- The frontend build reports the existing ExcelJS chunk-size warning.

## Candidate status

This is a release candidate, not a production deployment or signed source
control tag. Promote it to `1.0.0` only after deployment and acceptance checks.
