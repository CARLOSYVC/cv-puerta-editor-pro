import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const directory = '/backups';
const database = new URL(process.env.DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
}

const pgEnvironment = { ...process.env };
delete pgEnvironment.DATABASE_URL;
pgEnvironment.PGHOST = database.hostname;
pgEnvironment.PGPORT = database.port || '5432';
pgEnvironment.PGDATABASE = decodeURIComponent(database.pathname.slice(1));
if (database.username) pgEnvironment.PGUSER = decodeURIComponent(database.username);
if (database.password) pgEnvironment.PGPASSWORD = decodeURIComponent(database.password);

for (const [option, variable] of [
  ['sslmode', 'PGSSLMODE'],
  ['application_name', 'PGAPPNAME'],
  ['connect_timeout', 'PGCONNECT_TIMEOUT'],
]) {
  const value = database.searchParams.get(option);
  if (value) pgEnvironment[variable] = value;
}

mkdirSync(directory, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
const filename = `puerta-postgres-${timestamp}-${randomUUID().slice(0, 8)}.dump`;
const temporaryPath = join(directory, `${filename}.tmp`);
const backupPath = join(directory, filename);

function run(command, args) {
  const result = spawnSync(command, args, {
    env: pgEnvironment,
    stdio: 'ignore',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed${result.status === null ? '' : ` (${result.status})`}`);
  }
}

try {
  run('pg_dump', ['--format=custom', '--file', temporaryPath]);
  run('pg_restore', ['--list', temporaryPath]);
  renameSync(temporaryPath, backupPath);
  writeFileSync(join(directory, '.last-success'), `${Math.floor(Date.now() / 1000)}\n`, {
    mode: 0o600,
  });

  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const ownedBackup = /^puerta-postgres-\d{8}T\d{9}Z-[0-9a-f]{8}\.dump$/;
  for (const candidate of readdirSync(directory)) {
    if (!ownedBackup.test(candidate)) continue;
    const path = join(directory, candidate);
    if (statSync(path).isFile() && statSync(path).mtimeMs < cutoff) {
      rmSync(path);
    }
  }

  console.log(JSON.stringify({ level: 'info', event: 'backup.verified', file: filename }));
} catch (error) {
  rmSync(temporaryPath, { force: true });
  throw error;
}
