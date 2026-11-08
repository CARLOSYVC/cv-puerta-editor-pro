[CmdletBinding()]
param(
    [string]$BackupDirectory,
    [int]$RetentionDays,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$backupPattern = '^puerta-postgres-\d{8}T\d{9}Z-[0-9a-f]{8}\.dump$'
$databaseUrl = $env:DATABASE_URL
$connectionEnvironmentNames = @(
    'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD',
    'PGPASSFILE', 'PGSERVICE', 'PGSERVICEFILE', 'PGCHANNELBINDING',
    'PGCONNECT_TIMEOUT', 'PGCLIENTENCODING', 'PGOPTIONS', 'PGAPPNAME',
    'PGSSLMODE', 'PGSSLCOMPRESSION', 'PGSSLCERT', 'PGSSLKEY', 'PGSSLPASSWORD',
    'PGSSLROOTCERT', 'PGSSLCRL', 'PGSSLCRLDIR', 'PGSSLSNI',
    'PGSSL_MIN_PROTOCOL_VERSION', 'PGSSL_MAX_PROTOCOL_VERSION', 'PGGSSENCMODE',
    'PGGSSDELEGATION', 'PGKRBSRVNAME', 'PGTARGETSESSIONATTRS',
    'PGLOADBALANCEHOSTS', 'PGREQUIRESSL', 'PGREQUIREPEER', 'PGTCP_USER_TIMEOUT',
    'DATABASE_URL'
)
$originalEnvironment = @{}
$failureMessage = $null

function ConvertFrom-PostgresDatabaseUrl {
    param([Parameter(Mandatory)][string]$Value)

    if ($Value -match '%(?![0-9A-Fa-f]{2})') {
        throw 'DATABASE_URL contains invalid percent encoding.'
    }

    $uri = $null
    if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -notin @('postgres', 'postgresql')) {
        throw 'DATABASE_URL must be an absolute postgres:// or postgresql:// URI.'
    }
    if (-not [string]::IsNullOrEmpty($uri.Fragment)) {
        throw 'DATABASE_URL must not contain a fragment.'
    }

    $environment = @{}
    if (-not [string]::IsNullOrEmpty($uri.Host)) {
        $environment['PGHOST'] = [Uri]::UnescapeDataString($uri.Host)
    }
    if (-not $uri.IsDefaultPort) {
        $environment['PGPORT'] = $uri.Port.ToString(
            [System.Globalization.CultureInfo]::InvariantCulture
        )
    }
    if (-not [string]::IsNullOrEmpty($uri.UserInfo)) {
        $userInfo = $uri.UserInfo -split ':', 2
        $environment['PGUSER'] = [Uri]::UnescapeDataString($userInfo[0])
        if ($userInfo.Count -eq 2) {
            $environment['PGPASSWORD'] = [Uri]::UnescapeDataString($userInfo[1])
        }
    }

    $databasePath = $uri.AbsolutePath
    if ($databasePath.Length -gt 1) {
        $environment['PGDATABASE'] = [Uri]::UnescapeDataString($databasePath.Substring(1))
    }

    $queryEnvironmentNames = @{
        host = 'PGHOST'
        hostaddr = 'PGHOSTADDR'
        port = 'PGPORT'
        dbname = 'PGDATABASE'
        user = 'PGUSER'
        password = 'PGPASSWORD'
        passfile = 'PGPASSFILE'
        service = 'PGSERVICE'
        servicefile = 'PGSERVICEFILE'
        channel_binding = 'PGCHANNELBINDING'
        connect_timeout = 'PGCONNECT_TIMEOUT'
        client_encoding = 'PGCLIENTENCODING'
        options = 'PGOPTIONS'
        application_name = 'PGAPPNAME'
        sslmode = 'PGSSLMODE'
        sslcompression = 'PGSSLCOMPRESSION'
        sslcert = 'PGSSLCERT'
        sslkey = 'PGSSLKEY'
        sslpassword = 'PGSSLPASSWORD'
        sslrootcert = 'PGSSLROOTCERT'
        sslcrl = 'PGSSLCRL'
        sslcrldir = 'PGSSLCRLDIR'
        sslsni = 'PGSSLSNI'
        ssl_min_protocol_version = 'PGSSL_MIN_PROTOCOL_VERSION'
        ssl_max_protocol_version = 'PGSSL_MAX_PROTOCOL_VERSION'
        gssencmode = 'PGGSSENCMODE'
        gssdelegation = 'PGGSSDELEGATION'
        krbsrvname = 'PGKRBSRVNAME'
        target_session_attrs = 'PGTARGETSESSIONATTRS'
        load_balance_hosts = 'PGLOADBALANCEHOSTS'
        requiressl = 'PGREQUIRESSL'
        requirepeer = 'PGREQUIREPEER'
        tcp_user_timeout = 'PGTCP_USER_TIMEOUT'
    }

    if (-not [string]::IsNullOrEmpty($uri.Query)) {
        foreach ($pair in $uri.Query.Substring(1).Split('&')) {
            if ([string]::IsNullOrEmpty($pair)) {
                throw 'DATABASE_URL contains an empty query option.'
            }
            $parts = $pair -split '=', 2
            if ($parts.Count -ne 2) {
                throw 'Each DATABASE_URL query option must have a name and value.'
            }
            $name = [Uri]::UnescapeDataString($parts[0]).ToLowerInvariant()
            $optionValue = [Uri]::UnescapeDataString($parts[1])
            if ($name -eq 'schema') {
                continue
            }
            if (-not $queryEnvironmentNames.ContainsKey($name)) {
                throw "DATABASE_URL contains an unsupported libpq option: $name."
            }
            $environment[$queryEnvironmentNames[$name]] = $optionValue
        }
    }

    return $environment
}

try {
    if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
        throw 'DATABASE_URL is required in the process environment.'
    }
    $connectionEnvironment = ConvertFrom-PostgresDatabaseUrl -Value $databaseUrl

    if ([string]::IsNullOrWhiteSpace($BackupDirectory)) {
        $BackupDirectory = $env:POSTGRES_BACKUP_DIR
    }
    if ([string]::IsNullOrWhiteSpace($BackupDirectory)) {
        throw 'Set POSTGRES_BACKUP_DIR or pass -BackupDirectory.'
    }

    if (-not $PSBoundParameters.ContainsKey('RetentionDays')) {
        if ([string]::IsNullOrWhiteSpace($env:POSTGRES_BACKUP_RETENTION_DAYS)) {
            $RetentionDays = 14
        }
        else {
            $parsedRetention = 0
            if (-not [int]::TryParse($env:POSTGRES_BACKUP_RETENTION_DAYS, [ref]$parsedRetention)) {
                throw 'POSTGRES_BACKUP_RETENTION_DAYS must be a whole number.'
            }
            $RetentionDays = $parsedRetention
        }
    }
    if ($RetentionDays -lt 1 -or $RetentionDays -gt 36500) {
        throw 'Retention days must be between 1 and 36500.'
    }

    if ($ValidateOnly) {
        Write-Output 'Preflight passed: DATABASE_URL syntax and backup settings are valid; no database was contacted.'
        return
    }

    $pgDump = Get-Command -Name 'pg_dump' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $pgDump) {
        throw 'pg_dump was not found. Install PostgreSQL client tools and add them to PATH.'
    }
    $pgRestore = Get-Command -Name 'pg_restore' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $pgRestore) {
        throw 'pg_restore was not found. Install PostgreSQL client tools and add them to PATH.'
    }

    try {
        $resolvedBackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
    }
    catch {
        throw 'The configured backup directory path is invalid.'
    }
    if (Test-Path -LiteralPath $resolvedBackupDirectory) {
        if (-not (Test-Path -LiteralPath $resolvedBackupDirectory -PathType Container)) {
            throw 'The configured backup directory exists but is not a directory.'
        }
    }
    else {
        New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force | Out-Null
    }

    $timestamp = [DateTime]::UtcNow.ToString(
        'yyyyMMddTHHmmssfffZ',
        [System.Globalization.CultureInfo]::InvariantCulture
    )
    $uniqueSuffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $fileName = "puerta-postgres-$timestamp-$uniqueSuffix.dump"
    $backupPath = Join-Path -Path $resolvedBackupDirectory -ChildPath $fileName

    $dumpArguments = @(
        '--format=custom'
        '--no-password'
        "--file=$backupPath"
    )
    foreach ($environmentName in $connectionEnvironmentNames) {
        $originalEnvironment[$environmentName] = [Environment]::GetEnvironmentVariable(
            $environmentName,
            [EnvironmentVariableTarget]::Process
        )
        [Environment]::SetEnvironmentVariable($environmentName, $null, [EnvironmentVariableTarget]::Process)
    }
    foreach ($environmentName in $connectionEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable(
            $environmentName,
            [string]$connectionEnvironment[$environmentName],
            [EnvironmentVariableTarget]::Process
        )
    }
    $null = @(& $pgDump.Source @dumpArguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
            Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        }
        throw "pg_dump failed with exit code $LASTEXITCODE; native diagnostics were suppressed."
    }

    if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
        throw 'pg_dump reported success but did not create the backup file.'
    }
    if ((Get-Item -LiteralPath $backupPath).Length -eq 0) {
        Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        throw 'pg_dump created an empty backup file.'
    }

    $null = @(& $pgRestore.Source '--list' $backupPath 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        throw "pg_restore --list could not verify the backup (exit code $LASTEXITCODE); native diagnostics were suppressed."
    }

    $cutoff = [DateTime]::UtcNow.AddDays(-$RetentionDays)
    $expiredFiles = Get-ChildItem -LiteralPath $resolvedBackupDirectory -File |
        Where-Object {
            $_.Name -match $backupPattern -and
            ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0 -and
            $_.LastWriteTimeUtc -lt $cutoff
        }
    foreach ($expiredFile in $expiredFiles) {
        if ($expiredFile.Name -match $backupPattern -and
            ($expiredFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
            Remove-Item -LiteralPath $expiredFile.FullName -Force
        }
    }

    Write-Output "Verified PostgreSQL backup: $backupPath"
}
catch {
    $failureMessage = $_.Exception.Message
    if (-not [string]::IsNullOrWhiteSpace($databaseUrl)) {
        $failureMessage = $failureMessage.Replace($databaseUrl, '[redacted connection URL]')
    }
    $failureMessage = [regex]::Replace(
        $failureMessage,
        '(?i)postgres(?:ql)?://\S+',
        '[redacted connection URL]'
    )
}
finally {
    foreach ($environmentName in $originalEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable(
            $environmentName,
            $originalEnvironment[$environmentName],
            [EnvironmentVariableTarget]::Process
        )
    }
}

if ($null -ne $failureMessage) {
    [Console]::Error.WriteLine("PostgreSQL backup failed: $failureMessage")
    exit 1
}
