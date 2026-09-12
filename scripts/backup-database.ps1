$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupDirectory = Join-Path $projectRoot "backups"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$schemaFile = Join-Path $backupDirectory "schema-$timestamp.sql"
$dataFile = Join-Path $backupDirectory "data-$timestamp.sql"

Push-Location $projectRoot
try {
  npx supabase db dump --linked --schema public --file $schemaFile
  if ($LASTEXITCODE -ne 0) { throw "Falha ao exportar o esquema." }
  npx supabase db dump --linked --schema public --data-only --use-copy --file $dataFile
  if ($LASTEXITCODE -ne 0) { throw "Falha ao exportar os dados." }
  Write-Host "Backup concluído:" -ForegroundColor Green
  Write-Host $schemaFile
  Write-Host $dataFile
} finally {
  Pop-Location
}
