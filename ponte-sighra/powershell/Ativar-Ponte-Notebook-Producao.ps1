#requires -Version 5.1
[CmdletBinding()]
param([string]$SistemaUrl = 'https://sistema-acionamento.vercel.app')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'MySql-Nativo.ps1')

$configPath = Join-Path $PSScriptRoot 'config.notebook-teste.local.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw 'Configuracao do notebook nao encontrada. Execute este arquivo dentro da pasta C:\Ponte1.'
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($config.OwnerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) {
    throw 'Execute com a mesma conta do Windows usada para configurar a ponte.'
}
$uri = $null
if (-not [Uri]::TryCreate($SistemaUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo) {
    throw 'Informe uma URL HTTPS valida do Sistema de Acionamento.'
}

$config.SistemaUrl = $uri.GetLeftPart([UriPartial]::Authority)
$config.LocalTest = $false
if ($config.PSObject.Properties.Name -contains 'AllowPrivateTestServer') {
    $config.PSObject.Properties.Remove('AllowPrivateTestServer')
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Protect-SighraConfig $configPath $config.OwnerSid

Write-Host 'Ponte do notebook preparada para a producao.' -ForegroundColor Green
Write-Host 'Encerre a ponte local com Ctrl+C e execute novamente:'
Write-Host '.\Iniciar-Ponte-Teste-Remota.ps1' -ForegroundColor Cyan
