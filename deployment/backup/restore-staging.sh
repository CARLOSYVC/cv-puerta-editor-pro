#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

export RESTORE_DATABASE_URL=$DATABASE_URL
case "$RESTORE_DATABASE_URL" in
    postgres://*|postgresql://*) ;;
    *)
        echo "DATABASE_URL must be a PostgreSQL connection URL" >&2
        exit 1
        ;;
esac
unset DATABASE_URL

PGHOST=$(node -e 'process.stdout.write(new URL(process.env.RESTORE_DATABASE_URL).hostname)')
PGPORT=$(node -e 'process.stdout.write(new URL(process.env.RESTORE_DATABASE_URL).port || "5432")')
PGDATABASE=$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.RESTORE_DATABASE_URL).pathname.slice(1)))')
PGUSER=$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.RESTORE_DATABASE_URL).username))')
PGPASSWORD=$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.RESTORE_DATABASE_URL).password))')
export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
unset RESTORE_DATABASE_URL

if [ "$PGHOST" != "db-staging" ] || [ "$PGDATABASE" != "puerta_staging" ]; then
    echo "Refusing restore: target must be puerta_staging on db-staging." >&2
    exit 1
fi

backup=
for candidate in /backups/puerta-postgres-*.dump; do
    [ -f "$candidate" ] || continue
    name=${candidate##*/}
    printf '%s\n' "$name" | grep -Eq '^puerta-postgres-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}\.dump$' || continue
    backup=$candidate
done

if [ -z "$backup" ]; then
    echo "No backup archive was found in the staging backup volume." >&2
    exit 1
fi

pg_restore --list "$backup" >/dev/null

existing_objects=$(psql --set=ON_ERROR_STOP=1 --tuples-only --no-align --dbname="$PGDATABASE" \
    --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')")
case "$existing_objects" in
    ''|*[!0-9]*)
        echo "Could not safely verify that the staging target is empty." >&2
        exit 1
        ;;
    0) ;;
    *)
        echo "Refusing restore: puerta_staging is not empty. No objects were modified." >&2
        exit 1
        ;;
esac

pg_restore --exit-on-error --no-owner --no-acl --dbname="$PGDATABASE" "$backup"

missing_tables=$(psql --set=ON_ERROR_STOP=1 --tuples-only --no-align --dbname="$PGDATABASE" \
    --command="SELECT COALESCE(string_agg(required.table_name, ', '), '') FROM unnest(ARRAY['User', 'RolePermission', 'Client', 'Project', 'Material', 'PurchaseOrder', 'ProductionOrder', 'InventoryMovement', '_prisma_migrations']) AS required(table_name) WHERE to_regclass(format('public.%I', required.table_name)) IS NULL")
if [ -n "$missing_tables" ]; then
    echo "Restore completed but expected application tables are missing: $missing_tables" >&2
    exit 1
fi

table_count=$(psql --set=ON_ERROR_STOP=1 --tuples-only --no-align --dbname="$PGDATABASE" \
    --command="SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
migration_count=$(psql --set=ON_ERROR_STOP=1 --tuples-only --no-align --dbname="$PGDATABASE" \
    --command='SELECT count(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')

printf '{"level":"info","event":"restore.staging.passed","database":"puerta_staging","backup":"%s","tables":%s,"finishedMigrations":%s}\n' \
    "${backup##*/}" "$table_count" "$migration_count"
