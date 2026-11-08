#!/bin/sh
set -eu

LC_ALL=C
export LC_ALL

backup=
for candidate in /backups/puerta-postgres-*.dump; do
    [ -f "$candidate" ] || continue
    name=${candidate##*/}
    printf '%s\n' "$name" | grep -Eq '^puerta-postgres-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}\.dump$' || continue
    backup=$candidate
done

if [ -z "$backup" ]; then
    echo "No verified-format backup archive was found in the production backup volume." >&2
    exit 1
fi

pg_restore --list "$backup" >/dev/null

workdir=$(mktemp -d /tmp/puerta-restore-drill.XXXXXX)
data_dir=$workdir/data
socket_dir=$workdir/socket
mkdir "$socket_dir"

cleanup() {
    pg_ctl -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true
    rm -rf "$workdir"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

initdb -D "$data_dir" --auth-local=trust --auth-host=reject --username=restore_drill >/dev/null
pg_ctl -D "$data_dir" -o "-h '' -k $socket_dir" -w start >/dev/null

export PGHOST=$socket_dir
export PGUSER=restore_drill
export PGDATABASE=postgres
createdb restore_drill

pg_restore --exit-on-error --no-owner --no-acl --dbname=restore_drill "$backup"

missing_tables=$(psql --set=ON_ERROR_STOP=1 --tuples-only --no-align --dbname=restore_drill \
    --command="SELECT COALESCE(string_agg(required.table_name, ', '), '') FROM unnest(ARRAY['User', 'RolePermission', 'Client', 'Project', 'Material', 'PurchaseOrder', 'ProductionOrder', 'InventoryMovement', '_prisma_migrations']) AS required(table_name) WHERE to_regclass(format('public.%I', required.table_name)) IS NULL")
if [ -n "$missing_tables" ]; then
    echo "Restore completed but expected application tables are missing: $missing_tables" >&2
    exit 1
fi

migration_count=$(psql --set=ON_ERROR_STOP=1 --tuples-only --no-align --dbname=restore_drill \
    --command='SELECT count(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL')
case "$migration_count" in
    ''|*[!0-9]*|0)
        echo "Restore completed but no finished Prisma migrations were found." >&2
        exit 1
        ;;
esac

table_count=$(psql --set=ON_ERROR_STOP=1 --tuples-only --no-align --dbname=restore_drill \
    --command="SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
printf '{"level":"info","event":"restore.drill.passed","backup":"%s","tables":%s,"migrations":%s}\n' \
    "${backup##*/}" "$table_count" "$migration_count"
