#requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'MySql-Nativo.ps1')
Assert-SighraLibrary

function Read-Default([string]$Prompt, [string]$Default) {
    $value = Read-Host ($Prompt + ' [' + $Default + ']')
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value.Trim()
}

$hostName = Read-Default 'Host do banco SIGhRA acessivel pela VPN' '192.168.0.4'
$database = Read-Default 'Banco' 'mclient'
$userName = Read-Default 'Usuario' 'monitor'
$password = Read-Host 'Senha do banco SIGhRA para este notebook' -AsSecureString
if ($password.Length -eq 0) { throw 'A senha do banco nao pode ficar vazia.' }

$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$tokenText = [Convert]::ToBase64String($bytes)
$token = ConvertTo-SecureString $tokenText -AsPlainText -Force
$configPath = Join-Path $PSScriptRoot 'config.teste.local.json'
$config = [ordered]@{
    Host = $hostName; Port = 3306; Database = $database; User = $userName
    SistemaUrl = 'http://127.0.0.1:3100'
    LocalTest = $true
    OwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    PasswordEncrypted = ($password | ConvertFrom-SecureString)
    TokenEncrypted = ($token | ConvertFrom-SecureString)
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Protect-SighraConfig $configPath $config.OwnerSid
Write-Host 'Ponte de teste configurada. Os segredos ficaram criptografados somente para esta conta e este notebook.' -ForegroundColor Green
Write-Host 'Proximo passo: .\Iniciar-Servidor-Ponte-Teste.ps1'
