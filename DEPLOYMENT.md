# Docker deployment: staging and production

This deployment targets one Linux VPS with Docker Compose, Nginx, and Let's Encrypt. Both environments have separate application containers, PostgreSQL databases, persistent database volumes, and verified backup volumes. They share the host, CPU, memory, disk, Docker Engine, and Nginx. **A host, disk, or Docker Engine failure takes down both staging and production; loss of that host also loses all backups kept only in its Docker volumes.** This Compose topology is not high availability or disaster recovery.

The app and API use four DNS names:

| Purpose | Hostname |
| --- | --- |
| Production app | `APP_DOMAIN` |
| Production API and Swagger | `API_DOMAIN` |
| Staging app | `STAGING_APP_DOMAIN` |
| Staging API | `STAGING_API_DOMAIN` |

Create DNS `A` records for all four names pointing to the VPS public IP. Allow inbound TCP ports 80 and 443 in the host and provider firewalls. Docker and Docker Compose must be installed on the Linux host.

## Configure secrets and domains

From the repository root on the host:

1. Copy `deployment/host.env.example` to `.env` and replace all four example domains and the Let's Encrypt email.
2. Copy each of the six `deployment/*.env.example` files to its matching filename without `.example`. For example, copy `deployment/production.app.env.example` to `deployment/production.app.env`.
3. Use unique, randomly generated database passwords and JWT secrets for each environment. Set the database password in both that environment's `*.db.env` and its `*.app.env`/`*.backup.env` connection URLs. URL-encode special characters in the connection URL password. Do not commit or share the resulting env files.

The env files are excluded by `.gitignore`. Restrict access to them on the VPS; Docker environment variables are visible to host administrators and through Docker inspection.

## First startup and HTTPS

Start the databases, run each environment's checked-in Prisma migrations, and bring up both applications and the HTTP-only Nginx bootstrap:

```sh
docker compose -f deployment/compose.yml up -d --build
```

Request one certificate covering all four DNS names and switch Nginx to HTTPS:

```sh
chmod +x deployment/issue-certificates.sh
./deployment/issue-certificates.sh
```

The HTTPS Nginx config redirects HTTP to HTTPS, uses TLS 1.2/1.3, and routes app/API hostnames to their matching environment. The API remains private to the Compose network; PostgreSQL ports are not published on the host.

### Automatic certificate renewal

Install the included systemd timer on the VPS (the repository is expected at `/opt/puerta`):

```sh
sudo install -m 0644 deployment/puerta-cert-renew.service /etc/systemd/system/
sudo install -m 0644 deployment/puerta-cert-renew.timer /etc/systemd/system/
sudo chmod 0755 deployment/renew-certificates.sh
sudo systemctl daemon-reload
sudo systemctl enable --now puerta-cert-renew.timer
```

The timer checks daily and reloads Nginx after a successful renewal check. If the repository is installed elsewhere, update both `WorkingDirectory` and `ExecStart` in the service before enabling it. Check runs with `systemctl list-timers puerta-cert-renew.timer` and `journalctl -u puerta-cert-renew.service`.

## Deploy and operate

Build and deploy changes with `docker compose -f deployment/compose.yml up -d --build`. Each API waits for its own healthy database and for `prisma migrate deploy` to complete. Review production migrations and take/verify a backup before deploying a schema change; a migration failure prevents that API from starting.

Useful checks:

```sh
docker compose -f deployment/compose.yml ps
docker compose -f deployment/compose.yml logs --tail=100 edge api-production api-staging
docker compose -f deployment/compose.yml exec edge nginx -t
```

Nginx serves the frontend on the app domains and API/Swagger on the API domains. Use `/health/live` and `/health/ready` on each API hostname for deployment health checks.

## Automatic database backups

**Provisional production objectives:** RPO <= 24 hours and RTO <= 8 hours. Each environment's backup container takes an immediate PostgreSQL custom-format dump on startup, verifies it with `pg_restore --list`, then repeats every 12 hours. The shorter interval leaves margin under the 24-hour RPO for dump duration. The Compose health check marks a backup service unhealthy when no verified backup has completed in the past 24 hours; configure deployment monitoring to alert on that state. It retains 14 days by default (configurable in its `*.backup.env` file). Backup jobs and their health status are visible with:

```sh
docker compose -f deployment/compose.yml ps backup-staging backup-production
docker compose -f deployment/compose.yml logs --tail=100 backup-staging backup-production
```

Dumps are stored in separate Docker volumes (`backups_staging` and `backups_production`) on the same VPS as the databases. **Copying both environments' verified backups off-host is a prerequisite for host-loss recovery, not an optional enhancement.** Until that process is configured and monitored, the 24-hour RPO does not apply to a host or disk loss; the backups would be lost with the VPS. Store external copies in a separate failure domain with restricted access and encryption at rest and in transit, and monitor successful copy age as well as local backup health.

### Test staging and production restores

Run staging first, then production, and repeat periodically and after backup or database-tooling changes:

```sh
docker compose -f deployment/compose.yml --profile tools run --build --rm restore-drill-staging
docker compose -f deployment/compose.yml --profile tools run --build --rm restore-drill-production
```

Each drill mounts only that environment's backup volume read-only, chooses its newest archive, and restores it into a fresh PostgreSQL 16 instance in a disposable container on an isolated internal network. It does not connect to either application database, publish ports, or persist the restored data. It verifies the archive, checks the restored application tables and finished Prisma migrations, emits a `restore.drill.passed` JSON log on success, and removes the temporary database with the container. A missing/corrupt archive or failed restore returns a nonzero exit code.

These commands test backups created by the deployed staging and production backup services. The local Windows drill recorded in [backend/docs/postgres-backups.md](./backend/docs/postgres-backups.md) is a separate test of the development database; it does not substitute for either deployment environment. This containerized drill does not cover loss of the VPS or its Docker volumes. Run an additional restore drill using a copy retrieved from off-host storage into an isolated recovery host. Do not store backups in the application repository or on the same disk or host as the only recovery copy.

The provisional 24-hour RPO and 8-hour RTO are not guaranteed by local Docker volumes. **For a complete host failure, both targets depend on external backups and a documented replacement-host procedure** that covers compute capacity, DNS, secrets, TLS certificates, Docker/Compose, images/configuration, database restore, migrations, and application validation. Provision a separate recovery host or documented provider capacity path, and protect copies of deployment configuration and secrets outside the failed VPS. During a full host-loss drill, measure from incident declaration through infrastructure provisioning, off-host backup retrieval, restore, migrations, and application smoke checks. Until that end-to-end recovery has been rehearsed and timed, do not report either host-loss RPO or RTO as achieved.

The legacy development `docker-compose.yml` at the repository root is unchanged and is not the staging/production deployment.

## RC1 rollout and acceptance sequence

Complete these gates in order. Record the operator, date, evidence, and outcome for each gate. A checked box means the step was performed and its acceptance criteria passed; the current repository does not imply that any deployment gate has passed.

### 1. Restore staging

- [ ] Select the intended staging backup and record its origin and timestamp.
- [ ] Verify the custom-format archive with `pg_restore --list`.
- [ ] Confirm `puerta_staging` is empty. The deployment restore command refuses to proceed if it finds existing non-system database objects.
- [ ] Run the one-time restore command below; it mounts only the staging backup volume read-only and targets only `db-staging` / `puerta_staging`.
- [ ] Compare the restored schema and representative data, verify migration state, and record the backup checksum.
- [ ] Confirm the restore target is staging and is isolated from production before running any restore or migration command.

**Exit:** staging data is restored and validated; production data has not been modified.

On the VPS, with the Compose env files configured, restore the latest archive from the staging backup volume:

```sh
docker compose -f deployment/compose.yml --profile tools run --build --rm restore-staging
```

The command selects the newest correctly named staging archive, validates it before restore, and refuses a non-empty target. If this is the initial restore, deploy the current migrations to staging afterward and check status:

```sh
docker compose -f deployment/compose.yml run --rm migrate-staging
```

Do not run the migration job against production as part of this staging gate. If restore fails after writing objects, leave the staging API stopped and inspect/recreate only the confirmed staging database before retrying; do not use `--clean` or point the command at production.

### 2. Configure and verify DNS

- [ ] Create the staging app and API DNS records (`STAGING_APP_DOMAIN`, `STAGING_API_DOMAIN`) pointing to the VPS.
- [ ] Verify both names resolve to the intended public host and that TCP port 80 is reachable before requesting certificates.
- [ ] Confirm the DNS records and selected staging host with the operator; do not substitute example domains.

**Exit:** both staging names resolve correctly and the HTTP-01 challenge can reach Nginx.

### 3. Provision HTTPS

- [ ] Request the certificate using the staging DNS names after the HTTP bootstrap is responding.
- [ ] Verify the certificate names, chain, expiry, and HTTPS redirects for both staging domains.
- [ ] Enable and verify automatic certificate renewal.

**Exit:** the staging app and API use valid HTTPS; certificate renewal is scheduled and observable.

### 4. Deploy staging

- [ ] Configure staging-only secrets and database settings; confirm no production database URL or credentials are present in staging.
- [ ] Build and deploy the staging services after DNS and HTTPS checks pass. Apply reviewed migrations only to the staging database.
- [ ] Verify container health, `/health/live`, `/health/ready`, API access, frontend loading, and backup job health.
- [ ] Confirm production services and data have not been changed by the staging deployment.

**Exit:** staging is reachable over HTTPS, healthy, migrated, and backed up.

### 5. UAT (User Acceptance Testing)

- [ ] Invite designated testers and provide role-appropriate test accounts.
- [ ] Use staging and synthetic or approved test data only. Do not copy production personal data into staging unless separately approved and protected.
- [ ] Exercise the agreed critical workflows: client/project, production, purchasing/partial receiving, inventory, material consumption/costs, permissions, audit history, and XLSX/PDF export.
- [ ] Record browser/device, tester, steps, result, and evidence without recording passwords, tokens, or unnecessary personal data.

**Exit:** each critical workflow has an explicit pass/fail result and every failure is tracked for correction.

### 6. Correct defects and repeat acceptance

- [ ] Triage each defect by severity, impact, reproducibility, and release risk; block promotion for unresolved critical/high-impact defects.
- [ ] Fix defects on the RC branch, add or update regression tests, then rebuild and redeploy staging.
- [ ] Rerun the affected workflow and regression suite with testers; retain results for each iteration.
- [ ] Obtain explicit stakeholder acceptance of staging before separately scheduling production rollout and recovery checks.

**Exit:** accepted staging build, no unresolved release-blocking defects, and recorded sign-off. Production remains a separate approved deployment; completing this checklist is not itself production authorization.
