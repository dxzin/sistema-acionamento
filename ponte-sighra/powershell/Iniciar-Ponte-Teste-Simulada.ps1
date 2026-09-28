#requires -Version 5.1
[CmdletBinding()]
param([switch]$UmaVez)
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'config.teste.simulado.local.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Execute primeiro .\Configurar-Ponte-Teste-Simulada.ps1.' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($config.LocalTest -ne $true -or $config.Simulation -ne $true -or $config.SistemaUrl -ne 'http://127.0.0.1:3100') { throw 'Configuracao simulada invalida.' }
if ($config.OwnerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Use a mesma conta que configurou o teste.' }
$token = ConvertTo-SecureString $config.TokenEncrypted
$tokenText = [Net.NetworkCredential]::new('', $token).Password
if ($tokenText.Length -lt 32) { throw 'Chave local invalida.' }
$headers = @{ Authorization = 'Bearer ' + $tokenText }
$baseUrl = $config.SistemaUrl
$logPath = Join-Path $PSScriptRoot 'ponte-teste-simulada.log'

function Write-SimulationLog([string]$Message) {
    $line = '{0} - {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}
function New-Macro($Job, [string]$Name, [string]$Time, [string]$Id) {
    return [ordered]@{ id = $Id; login = [string]$Job.login; name = $Name; gps_at = ([string]$Job.since_date + ' ' + $Time)
        inserted_at = ([string]$Job.since_date + ' ' + $Time); vehicle = '999'; plate = 'TESTE'; point = 'NOTEBOOK TESTE'
        city = 'UBERABA'; state = 'MG'; street = $null; latitude = -19.7472; longitude = -47.9381 }
}

$nextHeartbeat = [DateTime]::MinValue
do {
    if ((Get-Date) -ge $nextHeartbeat) {
        $body = @{ database_ok = $true; query_enabled = $true; simulation = $true } | ConvertTo-Json -Compress
        Invoke-RestMethod -Method Post -Uri ($baseUrl + '/api/integracoes/sighra') -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
        Write-SimulationLog 'Sinal simulado entregue ao servidor local.'
        $nextHeartbeat = (Get-Date).AddSeconds(30)
    }
    $queue = Invoke-RestMethod -Method Post -Uri ($baseUrl + '/api/integracoes/sighra/tarefas') -Headers $headers
    if ($queue.job) {
        $start = New-Macro $queue.job 'INICIO DE JORNADA' '04:05:00' ('sim-' + $queue.job.id + '-inicio')
        $end = New-Macro $queue.job 'FIM DE JORNADA' '12:10:00' ('sim-' + $queue.job.id + '-fim')
        $answer = @{ id = $queue.job.id; lease_token = $queue.job.lease_token; result = @{
            macros = @($end, $start); last_end = $end; journey_events = @($start, $end)
        } } | ConvertTo-Json -Depth 8 -Compress
        Invoke-RestMethod -Method Patch -Uri ($baseUrl + '/api/integracoes/sighra/tarefas') -Headers $headers -ContentType 'application/json' -Body $answer | Out-Null
        Write-SimulationLog ('Consulta simulada respondida para o login ' + $queue.job.login + '.')
    }
    if ($UmaVez) { break }
    Start-Sleep -Seconds 5
} while ($true)
