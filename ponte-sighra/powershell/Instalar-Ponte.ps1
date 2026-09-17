#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$SistemaUrl,
    [switch]$RegistrarTarefa
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'MySql-Nativo.ps1')
Assert-SighraLibrary
if (-not $SistemaUrl) { $SistemaUrl = Read-Host 'URL HTTPS do sistema online' }
$uri = $null
if (-not [Uri]::TryCreate($SistemaUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo) {
    throw 'Informe uma URL HTTPS valida, sem credenciais na URL.'
}
$password = Read-Host 'Senha do banco Sighra' -AsSecureString
$token = Read-Host 'Chave da ponte configurada no servidor (minimo 32 caracteres)' -AsSecureString
if ($password.Length -eq 0 -or $token.Length -lt 32) { throw 'Senha vazia ou chave muito curta.' }
$configPath = Join-Path $PSScriptRoot 'config.local.json'
$config = [ordered]@{
    Host = '192.168.0.4'; Port = 3306; Database = 'mclient'; User = 'monitor'
    SistemaUrl = $uri.GetLeftPart([UriPartial]::Authority)
    OwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    PasswordEncrypted = ($password | ConvertFrom-SecureString)
    TokenEncrypted = ($token | ConvertFrom-SecureString)
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
# DPAPI protege os segredos; restringir tambem a leitura do arquivo de configuracao.
Protect-SighraConfig $configPath $config.OwnerSid
Write-Host 'Configuracao salva. Segredos protegidos para esta conta neste computador.'
if ($RegistrarTarefa) {
    $account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $windowsFolder = if ([Environment]::Is64BitProcess) { 'System32' } else { 'SysWOW64' }
    $exe = Join-Path $env:WINDIR ($windowsFolder + '\WindowsPowerShell\v1.0\powershell.exe')
    $script = Join-Path $PSScriptRoot 'Iniciar-Ponte.ps1'
    $action = New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $script + '"') -WorkingDirectory $PSScriptRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
    $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName 'Ponte Sighra' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host 'Tarefa registrada: inicia quando esta conta entra no Windows. Nao inicia antes do login.'
}
Write-Host 'Teste: .\Iniciar-Ponte.ps1 -UmaVez'
