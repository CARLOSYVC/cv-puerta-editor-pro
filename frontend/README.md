# Puerta Operations Frontend

The frontend is a React and TypeScript application built with Vite. Its current
scope is the operations workspace shell and navigation for Dashboard, Projects,
Materials, Inventory, Production Orders, Material Consumption, and Costs.

## Development

From this directory, install dependencies and start the development server:

```sh
npm install
npm run dev
```

The Projects page connects to the NestJS API at `http://localhost:3000` by
default. Set `VITE_API_BASE_URL` in a local `.env` file to use a different API
URL. The API must allow the frontend's origin via its `FRONTEND_ORIGINS`
environment variable when running outside the default local development URLs.

Projects require an authenticated account. The Projects page supports signing
in or registering, creating a client, then creating, listing, editing, and
deleting projects. New clients and projects are saved through the NestJS API to
PostgreSQL; the UI adds each record after the API confirms the write.

API calls are organized under `src/services`: `api.ts` provides the shared HTTP
client, while `projects.ts`, `clients.ts`, and `materials.ts` expose typed module
operations.

The Materials page supports listing, searching, creating, editing, and deleting
materials with a name, optional description, unit, and unit cost. Its Prisma
model is applied through the `add_materials` migration.

Inventory, Production Orders, Material Consumption, and Costs remain navigation
placeholders.

## Build

```sh
npm run build
```
