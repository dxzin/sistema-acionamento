#requires -Version 5.1
[CmdletBinding()]
param([switch]$UmaVez)
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'config.notebook-teste.local.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Execute primeiro .\Configurar-Ponte-Teste-Remota.ps1.' }
& (Join-Path $PSScriptRoot 'Iniciar-Ponte.ps1') -ConfigPath $configPath -UmaVez:$UmaVez
