#!/bin/sh
set -eu

for name in APP_DOMAIN API_DOMAIN STAGING_APP_DOMAIN STAGING_API_DOMAIN; do
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
        echo "Required domain variable is missing: $name" >&2
        exit 1
    fi
done

template=/etc/nginx/templates/bootstrap.conf.template
if [ -s /etc/letsencrypt/live/puerta/fullchain.pem ] &&
   [ -s /etc/letsencrypt/live/puerta/privkey.pem ]; then
    template=/etc/nginx/templates/tls.conf.template
fi

envsubst '${APP_DOMAIN} ${API_DOMAIN} ${STAGING_APP_DOMAIN} ${STAGING_API_DOMAIN}' \
    < "$template" > /etc/nginx/conf.d/default.conf
exec "$@"
