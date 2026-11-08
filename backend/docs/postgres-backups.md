# PostgreSQL backups

`scripts\Backup-Postgres.ps1` creates a timestamped PostgreSQL custom-format dump and checks it with `pg_restore --list`. It reads `DATABASE_URL` from the process environment; it does not read `.env` or print the connection URL. The script parses the PostgreSQL URI into libpq `PG*` environment variables for the child process (including percent-decoded credentials and supported query options), removes `DATABASE_URL` from that process environment, and restores the original environment when finished. Credentials are not command-line arguments. The Prisma-specific `schema` query parameter is ignored: the dump covers the connected database, not just one schema. Install PostgreSQL client tools and ensure both `pg_dump` and `pg_restore` are on `PATH` (prefer a client version compatible with the server).

## Configure and run

Set these variables in the backup process's protected environment:

- `DATABASE_URL` — required PostgreSQL connection URL. Supply it through the deployment's secret-management mechanism; do not put it in scripts, command history, or logs.
- `POSTGRES_BACKUP_DIR` — required local directory for dump files. Restrict its filesystem access to the backup operator/service account and administrators.
- `POSTGRES_BACKUP_RETENTION_DAYS` — optional positive whole number of days; defaults to `14`.

From the repository root, run:

```powershell
.\backend\scripts\Backup-Postgres.ps1
```

Alternatively, pass `-BackupDirectory` and/or `-RetentionDays` on the command line. The script creates the destination directory if needed. Successful dumps are named `puerta-postgres-<UTC timestamp>-<unique id>.dump`; the script reports failure with a nonzero exit code if a required tool is missing, `pg_dump` fails, or the archive cannot be listed by `pg_restore`. Native tool diagnostics are suppressed to avoid exposing connection details.

To check the URI syntax, supported query options, and settings without requiring PostgreSQL tools or contacting a database, run `.\backend\scripts\Backup-Postgres.ps1 -ValidateOnly` after setting the required environment variables.

Retention runs only after the new dump passes verification. It removes only non-link files directly inside the configured directory whose names exactly match this script's backup naming pattern and whose modification time is older than the configured retention period. It does not recurse or remove other files.

## Local Windows restore drill

The following procedure creates a fresh backup of the local `cvpuerta` database and restores it into a new `cvpuerta_restore` database. It refuses to overwrite an existing target. Run it only against a local, non-production source and a target database you are willing to create. Install PostgreSQL client tools compatible with the server and add their `bin` directory to `PATH`.

From the repository root in PowerShell, load the URL into the current process without printing it, then expose its connection fields through libpq environment variables rather than command-line arguments:

```powershell
$line = Get-Content .\backend\.env | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
$env:DATABASE_URL = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$uri = [Uri]$env:DATABASE_URL
if ($uri.Host -notin @('localhost', '127.0.0.1', '::1') -or [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/')) -ne 'cvpuerta') {
    throw 'Refusing restore drill: expected the local cvpuerta database.'
}
$env:PGHOST = $uri.Host
$env:PGPORT = if ($uri.IsDefaultPort) { '5432' } else { [string]$uri.Port }
$parts = $uri.UserInfo -split ':', 2
$env:PGUSER = [Uri]::UnescapeDataString($parts[0])
if ($parts.Count -gt 1) { $env:PGPASSWORD = [Uri]::UnescapeDataString($parts[1]) }
$env:PGDATABASE = 'postgres'
$env:PATH = 'C:\Program Files\PostgreSQL\18\bin;' + $env:PATH
```

Create and validate the custom-format backup:

```powershell
$backupDirectory = Join-Path (Get-Location) 'deployment\backups'
& .\backend\scripts\Backup-Postgres.ps1 -BackupDirectory $backupDirectory
if ($LASTEXITCODE -ne 0) { throw 'Backup failed.' }
$backup = Get-ChildItem $backupDirectory -Filter 'puerta-postgres-*.dump' |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not $backup) { throw 'No backup archive was created.' }
& pg_restore --list $backup.FullName | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Backup archive validation failed.' }
```

Check that the restore target is absent before creating it. Restore the selected archive and stop on the first SQL error:

```powershell
$exists = & psql -X -v ON_ERROR_STOP=1 -At -d postgres `
    -c "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'cvpuerta_restore')"
if ($LASTEXITCODE -ne 0 -or $exists.Trim() -ne 'f') {
    throw 'cvpuerta_restore already exists or could not be checked; refusing to overwrite it.'
}
& createdb --owner $env:PGUSER cvpuerta_restore
if ($LASTEXITCODE -ne 0) { throw 'Could not create cvpuerta_restore.' }
& pg_restore --exit-on-error --no-owner --no-acl `
    --dbname=cvpuerta_restore $backup.FullName
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; inspect the test database before retrying.' }
```

Before upgrading the restored copy, compare its public table names and exact row counts with `cvpuerta`, check that all restored foreign keys are validated, and confirm the archive with `pg_restore --list`. Then, if the clone is behind the checked-in migrations, apply those migrations to the clone only:

```powershell
$builder = [System.UriBuilder]$uri
$builder.Path = '/cvpuerta_restore'
$env:DATABASE_URL = $builder.Uri.AbsoluteUri
Push-Location .\backend
npm.cmd exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Migrations failed on the restore clone.' }
npm.cmd exec prisma migrate status
if ($LASTEXITCODE -ne 0) { throw 'Restore clone still has pending migrations.' }
Pop-Location
```

Finally run read-only application smoke queries with the generated Prisma client and verify the current database is `cvpuerta_restore`. Do not run these migration steps with the source URL. Keep the backup, SHA-256, restore result, migration result, and check summary in the drill record; restrict access to the backup and remove a test database only after confirming its name and that it is no longer needed.

### Completed local drill

- Source: local PostgreSQL 18 database `cvpuerta`.
- Archive: `deployment\backups\puerta-postgres-20261108T021653082Z-0909caf8.dump`; custom-format listing succeeded. SHA-256: `D9A03E6420DEF78E9A6C523DC3371CC893126653B87AF149614DC31C24D08A9E`.
- Restore target: newly created `cvpuerta_restore`; archive restore completed without SQL errors.
- Data checks before migration: all 13 public table names matched the source, exact row counts matched for every public table, and there were no unvalidated foreign keys.
- The source backup had 15 finished Prisma migrations; the repository contains 17. The two pending additive migrations were applied only to `cvpuerta_restore`; `prisma migrate status` then reported the database schema up to date.
- Prisma client smoke queries passed for database identity, users, clients, projects, materials, and role permissions (107 seeded permission rows).
- The machine-readable backup/checksum/restore record is beside the archive as `deployment\backups\puerta-postgres-20261108T021653082Z-0909caf8.dump.json`.

## Recovery objectives

The provisional production targets are **RPO <= 24 hours** and **RTO <= 8 hours**. The deployment backup worker runs every 12 hours and its Compose health check fails if no verified backup completed in 24 hours. These targets depend on successful, monitored backup runs; the 12-hour schedule provides margin for dump duration and an earlier retry after a failed job. Both environments and their local backup volumes currently share one VPS. **A host, disk, or Docker Engine failure takes down the entire deployment; loss of that host also loses all backups stored only there.** Local backups alone do not provide host-loss recovery and do not satisfy the proposed RPO for that failure scenario.

Keep verified backups for both environments in an access-controlled, encrypted, off-host failure domain, and keep the deployment instructions, DNS settings, secrets, and recovery-host provisioning path available outside the VPS. The local restore test above confirms a development backup can be restored, but is not a timed staging/production disaster-recovery test and does not establish the 8-hour RTO. For each deployed restore drill, record incident start, backup retrieval, restore start/end, schema and application checks, and service recovery. For a VPS-loss scenario, include replacement-host provisioning and retrieval from off-host storage. Compare the measured total with 8 hours before treating the target as achieved.

## Operations

- Choose and document a backup cadence based on the service's recovery point objective. Configure a production scheduler (for example, Windows Task Scheduler on a protected host) to run this script under a dedicated least-privilege account, with the required environment variables available to that task. Alert on nonzero exit codes and monitor backup age, available disk space, and job completion.
- Keep the local backup directory on storage with adequate capacity and access controls. This script does not encrypt dumps or upload them. Copy verified backups to an approved off-host location using a separate process, with encryption in transit and at rest, restricted access, and managed/rotated encryption keys. Protect local storage with encryption as well if its risk profile requires it.
- Periodically perform a restore drill into an isolated, non-production PostgreSQL instance of a compatible major version. Retrieve a copy from off-host storage, verify its archive listing with `pg_restore --list`, restore it using the approved secure credential-injection method, and validate representative schema and application data. Record the result and recovery time; never use a production destination for a drill.
- Treat host-loss recovery as a separate exercise from an in-place database restore: test from off-host backup through a replacement host, restored database, application startup, DNS/TLS readiness, and verified service recovery.

This script does **not** configure a production scheduler, cloud storage, off-host transfer, or encryption. The local Windows restore procedure above is for a non-production local database; use the isolated Docker restore drill in `../../DEPLOYMENT.md` for the deployment backup volume.
