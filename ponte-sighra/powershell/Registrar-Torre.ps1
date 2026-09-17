#requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'MySql-Nativo.ps1')
Assert-SighraLibrary
# Validar os segredos existentes sem solicitar senha nem sobrescrever configuracao.
& (Join-Path $PSScriptRoot 'Iniciar-Ponte.ps1') -ValidarConfiguracao | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$windowsFolder = if ([Environment]::Is64BitProcess) { 'System32' } else { 'SysWOW64' }
$exe = Join-Path $env:WINDIR ($windowsFolder + '\WindowsPowerShell\v1.0\powershell.exe')
$script = Join-Path $PSScriptRoot 'Iniciar-Ponte.ps1'
$action = New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $script + '"') -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid
$principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Ponte Sighra' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'Ponte Sighra'
Write-Host 'Ponte Sighra registrada e inicio solicitado.' -ForegroundColor Green
Write-Host 'Inicia ao entrar nesta conta do Windows e continua com a tela bloqueada.'
Write-Host 'Depois de reiniciar o PC, entre nesta conta e conecte a VPN, se necessaria.'
Write-Host 'Nao inicia antes do login. Confira Sighra: online no sistema e consulte um login.'
