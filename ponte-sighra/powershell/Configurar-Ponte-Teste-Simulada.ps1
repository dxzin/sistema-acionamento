#requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'MySql-Nativo.ps1')
$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$token = ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
$configPath = Join-Path $PSScriptRoot 'config.teste.simulado.local.json'
$config = [ordered]@{
    SistemaUrl = 'http://127.0.0.1:3100'; LocalTest = $true; Simulation = $true
    OwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    TokenEncrypted = ($token | ConvertFrom-SecureString)
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Protect-SighraConfig $configPath $config.OwnerSid
Write-Host 'Ambiente simulado configurado. Ele nao acessa o banco SIGhRA nem o PC da empresa.' -ForegroundColor Green
Write-Host 'Proximo passo: .\Iniciar-Servidor-Ponte-Teste-Simulada.ps1'
