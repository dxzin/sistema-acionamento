#requires -Version 5.1
[CmdletBinding()]
param()
$configPath = Join-Path $PSScriptRoot 'config.teste.simulado.local.json'
& (Join-Path $PSScriptRoot 'Iniciar-Servidor-Ponte-Teste.ps1') -ConfigPath $configPath
