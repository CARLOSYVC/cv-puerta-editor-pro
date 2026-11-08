FROM postgres:16-alpine

RUN apk add --no-cache nodejs
COPY backup.mjs /usr/local/bin/backup.mjs
COPY entrypoint.sh /usr/local/bin/backup-entrypoint
COPY restore-drill.sh /usr/local/bin/restore-drill
COPY restore-staging.sh /usr/local/bin/restore-staging
RUN chmod 755 /usr/local/bin/backup-entrypoint /usr/local/bin/restore-drill /usr/local/bin/restore-staging

ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
