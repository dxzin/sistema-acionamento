#requires -Version 5.1
[CmdletBinding()]
param([string]$ConfigPath = (Join-Path $PSScriptRoot 'config.teste.local.json'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Execute primeiro .\Configurar-Ponte-Teste.ps1.' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($config.LocalTest -ne $true -or $config.SistemaUrl -ne 'http://127.0.0.1:3100') { throw 'Configuracao de teste invalida.' }
if ($config.OwnerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Use a mesma conta que configurou a ponte de teste.' }
$token = ConvertTo-SecureString $config.TokenEncrypted
$tokenText = [Net.NetworkCredential]::new('', $token).Password
if ($tokenText.Length -lt 32) { throw 'Chave local invalida. Configure novamente.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$env:SIGHRA_LOCAL_BRIDGE_TEST = 'true'
$env:SIGHRA_LOCAL_BRIDGE_TOKEN = $tokenText
$env:NEXT_PUBLIC_SIGHRA_JOURNEY_MODE = 'pilot'
$env:NEXT_PUBLIC_SIGHRA_JOURNEY_PROVIDER = 'sighra'
$env:NEXT_DIST_DIR = '.next-sighra-test'
Write-Host 'Servidor isolado: http://127.0.0.1:3100' -ForegroundColor Green
Write-Host 'Mantenha esta janela aberta. Ctrl+C encerra somente o servidor de teste.'
Push-Location $projectRoot
try { & npm.cmd run dev -- --port 3100 }
finally {
    Pop-Location
    Remove-Item Env:SIGHRA_LOCAL_BRIDGE_TEST, Env:SIGHRA_LOCAL_BRIDGE_TOKEN, Env:NEXT_PUBLIC_SIGHRA_JOURNEY_MODE, Env:NEXT_PUBLIC_SIGHRA_JOURNEY_PROVIDER, Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
}
