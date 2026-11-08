#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_RETENTION_DAYS:=14}"

case "$BACKUP_RETENTION_DAYS" in
    ''|*[!0-9]*)
        echo "BACKUP_RETENTION_DAYS must be a positive whole number" >&2
        exit 1
        ;;
esac
if [ "$BACKUP_RETENTION_DAYS" -lt 1 ] || [ "$BACKUP_RETENTION_DAYS" -gt 36500 ]; then
    echo "BACKUP_RETENTION_DAYS must be between 1 and 36500" >&2
    exit 1
fi

stop=0
trap 'stop=1' TERM INT
while [ "$stop" -eq 0 ]; do
    if node /usr/local/bin/backup.mjs; then
        :
    else
        echo '{"level":"error","event":"backup.failed"}' >&2
    fi
    sleep 43200 &
    wait $! || true
done
