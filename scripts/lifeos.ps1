param(
  [Parameter(Mandatory = $false, Position = 0)]
  [string]$Command,

  [Parameter(Mandatory = $false, Position = 1)]
  [string]$Argument
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RootDir ".env"
$EnvExampleFile = Join-Path $RootDir ".env.example"

function Write-Info([string]$Message) {
  Write-Host "[life-os] $Message"
}

function Fail([string]$Message) {
  throw "[life-os] ERROR: $Message"
}

function Ensure-Requirements {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Required command not found: docker"
  }

  if (-not (Test-Path $EnvFile)) {
    Copy-Item -Path $EnvExampleFile -Destination $EnvFile
    Write-Info "Created .env from .env.example"
  }

  docker compose version | Out-Null
}

function Get-EnvValue([string]$Name, [string]$Default) {
  if (-not (Test-Path $EnvFile)) {
    return $Default
  }

  $line = Select-String -Path $EnvFile -Pattern "^$([regex]::Escape($Name))=" | Select-Object -First 1
  if (-not $line) {
    return $Default
  }

  $value = ($line.Line -split "=", 2)[1]
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }

  return $value
}

function Compose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & docker compose --project-directory $RootDir @Args
}

function Compose-WithTag {
  param(
    [string]$Tag,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Args
  )

  $previousTag = $env:LIFE_OS_IMAGE_TAG
  $env:LIFE_OS_IMAGE_TAG = $Tag
  try {
    & docker compose --project-directory $RootDir @Args
  } finally {
    $env:LIFE_OS_IMAGE_TAG = $previousTag
  }
}

function Set-EnvValue([string]$Name, [string]$Value) {
  if (-not (Test-Path $EnvFile)) {
    New-Item -ItemType File -Path $EnvFile -Force | Out-Null
  }

  $content = Get-Content $EnvFile
  $updated = $false
  $result = @()

  foreach ($line in $content) {
    if ($line -match "^$([regex]::Escape($Name))=") {
      $result += "$Name=$Value"
      $updated = $true
    } else {
      $result += $line
    }
  }

  if (-not $updated) {
    $result += "$Name=$Value"
  }

  Set-Content -Path $EnvFile -Value $result
}

function Install-Stack {
  Ensure-Requirements
  Write-Info "Pulling base images"
  Compose pull postgres redis postgres-backup ops-monitor
  Write-Info "Building app images"
  Compose build api worker web hermes
  Write-Info "Starting stack"
  Compose up -d
  Write-Info "Stack is up"
}

function Backup-Once {
  Ensure-Requirements

  $db = Get-EnvValue "POSTGRES_DB" "life_os"
  $user = Get-EnvValue "POSTGRES_USER" "life_os"
  $backupDir = Get-EnvValue "POSTGRES_BACKUP_DIR" "./backups/postgres"

  if (-not [System.IO.Path]::IsPathRooted($backupDir)) {
    $backupDir = Join-Path $RootDir $backupDir
  }

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
  $backupFile = Join-Path $backupDir "life_os_manual_$stamp.sql.gz"

  Write-Info "Creating backup at $backupFile"

  $dump = Compose exec -T postgres pg_dump -U $user -d $db --no-owner --no-privileges
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($dump -join "`n"))
  $memory = New-Object System.IO.MemoryStream
  $gzip = New-Object System.IO.Compression.GZipStream($memory, [System.IO.Compression.CompressionMode]::Compress)
  $gzip.Write($bytes, 0, $bytes.Length)
  $gzip.Close()
  [System.IO.File]::WriteAllBytes($backupFile, $memory.ToArray())

  Write-Info "Backup created"
}

function Update-Stack {
  Ensure-Requirements
  Backup-Once
  Write-Info "Updating images"
  Compose pull
  Write-Info "Rebuilding app images"
  Compose build api worker web hermes
  Write-Info "Applying update"
  Compose up -d --remove-orphans
  Write-Info "Update complete"
}

function Wait-ForServiceHealth([string]$ContainerName, [int]$TimeoutSeconds = 180) {
  $start = Get-Date
  while ($true) {
    $status = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $ContainerName 2>$null
    if ($status -eq "healthy" -or $status -eq "running") {
      return $true
    }

    if (((Get-Date) - $start).TotalSeconds -gt $TimeoutSeconds) {
      return $false
    }

    Start-Sleep -Seconds 3
  }
}

function Invoke-Health {
  Ensure-Requirements

  $apiUrl = Get-EnvValue "OPS_API_HEALTH_URL" "http://localhost:4000/health"
  $webUrl = Get-EnvValue "OPS_WEB_HEALTH_URL" "http://localhost:3000/"
  $hermesUrl = Get-EnvValue "OPS_HERMES_HEALTH_URL" "http://localhost:4010/health"
  $maxAge = [int](Get-EnvValue "OPS_MONITOR_MAX_BACKUP_AGE_SECONDS" "172800")
  $backupDir = Get-EnvValue "POSTGRES_BACKUP_DIR" "./backups/postgres"
  $webhook = Get-EnvValue "OPS_ALERT_WEBHOOK_URL" ""

  if (-not [System.IO.Path]::IsPathRooted($backupDir)) {
    $backupDir = Join-Path $RootDir $backupDir
  }

  $failed = $false

  try {
    Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 8 | Out-Null
  } catch {
    Write-Info "Health check failed: API endpoint unreachable"
    $failed = $true
  }

  try {
    Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 8 | Out-Null
  } catch {
    Write-Info "Health check failed: Web endpoint unreachable"
    $failed = $true
  }

  try {
    Invoke-WebRequest -Uri $hermesUrl -UseBasicParsing -TimeoutSec 8 | Out-Null
  } catch {
    Write-Info "Health check failed: Hermes endpoint unreachable"
    $failed = $true
  }

  if (-not (Test-Path $backupDir)) {
    Write-Info "Health check failed: Backup directory missing"
    $failed = $true
  } else {
    $latest = Get-ChildItem -Path $backupDir -Filter *.sql.gz -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $latest) {
      Write-Info "Health check failed: No PostgreSQL backup found"
      $failed = $true
    } else {
      $age = [int]((Get-Date).ToUniversalTime() - $latest.LastWriteTimeUtc).TotalSeconds
      if ($age -gt $maxAge) {
        Write-Info "Health check failed: Backup is stale ($age s old)"
        $failed = $true
      }
    }
  }

  if (-not $failed) {
    Write-Info "Health check passed"
    return
  }

  if (-not [string]::IsNullOrWhiteSpace($webhook)) {
    try {
      $payload = @{ text = "Life OS health check failed" } | ConvertTo-Json -Compress
      Invoke-WebRequest -Uri $webhook -Method Post -ContentType "application/json" -Body $payload -UseBasicParsing | Out-Null
    } catch {
      Write-Info "Alert webhook dispatch failed"
    }
  }

  Fail "Health check failed"
}

function Release-Update([string]$Tag) {
  Ensure-Requirements
  if ([string]::IsNullOrWhiteSpace($Tag)) {
    Fail "Usage: ./scripts/lifeos.ps1 release-update <image-tag>"
  }

  $previousTag = Get-EnvValue "LIFE_OS_IMAGE_TAG" "local"

  Backup-Once
  Write-Info "Pulling immutable release images for tag $Tag"
  Compose-WithTag -Tag $Tag pull api worker web hermes

  Write-Info "Deploying release tag $Tag"
  Compose-WithTag -Tag $Tag up -d --no-build api worker web hermes

  if (-not (Wait-ForServiceHealth -ContainerName "life-os-api" -TimeoutSeconds 180) -or -not (Wait-ForServiceHealth -ContainerName "life-os-web" -TimeoutSeconds 180) -or -not (Wait-ForServiceHealth -ContainerName "life-os-hermes" -TimeoutSeconds 180)) {
    Write-Info "Release health check failed, rolling back to $previousTag"
    Compose-WithTag -Tag $previousTag up -d --no-build api worker web hermes
    Fail "Release update failed and rollback was applied"
  }

  Set-EnvValue -Name "LIFE_OS_IMAGE_TAG" -Value $Tag
  Write-Info "Release update complete"
}

function Restore-FromFile([string]$FilePath) {
  Ensure-Requirements
  if (-not $FilePath) {
    Fail "Usage: ./scripts/lifeos.ps1 restore <path-to-backup.sql.gz>"
  }

  if (-not (Test-Path $FilePath)) {
    Fail "Backup file not found: $FilePath"
  }

  $db = Get-EnvValue "POSTGRES_DB" "life_os"
  $user = Get-EnvValue "POSTGRES_USER" "life_os"

  Write-Info "Restoring $FilePath"

  $bytes = [System.IO.File]::ReadAllBytes($FilePath)
  $memory = New-Object System.IO.MemoryStream(,$bytes)
  $gzip = New-Object System.IO.Compression.GZipStream($memory, [System.IO.Compression.CompressionMode]::Decompress)
  $reader = New-Object System.IO.StreamReader($gzip)
  $sql = $reader.ReadToEnd()
  $reader.Close()

  $tmpFile = Join-Path $env:TEMP "life-os-restore.sql"
  [System.IO.File]::WriteAllText($tmpFile, $sql)

  Get-Content $tmpFile | Compose exec -T postgres psql -U $user -d $db
  Remove-Item $tmpFile -ErrorAction SilentlyContinue

  Write-Info "Restore completed"
}

function Show-Status {
  Ensure-Requirements
  Compose ps
}

function Show-Logs {
  Ensure-Requirements
  Compose logs --tail=150 -f
}

function Stop-Stack {
  Ensure-Requirements
  Compose down
}

function Show-Usage {
  @"
Life OS operations utility

Usage:
  ./scripts/lifeos.ps1 install      Prepare and start the full stack
  ./scripts/lifeos.ps1 update       Backup, pull, rebuild, and restart the stack
  ./scripts/lifeos.ps1 release-update TAG Deploy immutable tagged images with rollback on health failure
  ./scripts/lifeos.ps1 backup       Run an immediate PostgreSQL backup
  ./scripts/lifeos.ps1 health       Run one-shot health and backup freshness checks
  ./scripts/lifeos.ps1 restore FILE Restore PostgreSQL from a .sql.gz backup
  ./scripts/lifeos.ps1 status       Show running services
  ./scripts/lifeos.ps1 logs         Follow service logs
  ./scripts/lifeos.ps1 stop         Stop and remove running services
"@ | Write-Host
}

switch ($Command) {
  "install" { Install-Stack }
  "update" { Update-Stack }
  "release-update" { Release-Update -Tag $Argument }
  "backup" { Backup-Once }
  "health" { Invoke-Health }
  "restore" { Restore-FromFile -FilePath $Argument }
  "status" { Show-Status }
  "logs" { Show-Logs }
  "stop" { Stop-Stack }
  default { Show-Usage }
}
