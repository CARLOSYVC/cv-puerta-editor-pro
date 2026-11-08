#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

docker compose -f deployment/compose.yml --profile tools \
    run --rm certbot renew \
    --webroot --webroot-path /var/www/certbot --quiet
docker compose -f deployment/compose.yml exec -T edge nginx -s reload
