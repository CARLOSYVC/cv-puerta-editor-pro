#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

if [ ! -f .env ]; then
    echo "Copy deployment/host.env.example to .env and configure the domains first." >&2
    exit 1
fi

set -a
. ./.env
set +a

for name in APP_DOMAIN API_DOMAIN STAGING_APP_DOMAIN STAGING_API_DOMAIN LETSENCRYPT_EMAIL; do
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
        echo "Required setting is missing from .env: $name" >&2
        exit 1
    fi
done

docker compose -f deployment/compose.yml --profile tools run --rm certbot certonly \
    --webroot --webroot-path /var/www/certbot \
    --cert-name puerta \
    --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email \
    -d "$APP_DOMAIN" \
    -d "$API_DOMAIN" \
    -d "$STAGING_APP_DOMAIN" \
    -d "$STAGING_API_DOMAIN"

docker compose -f deployment/compose.yml restart edge
