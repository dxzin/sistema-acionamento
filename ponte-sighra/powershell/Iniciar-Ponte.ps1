#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.local.json'),
    [switch]$UmaVez,
    [switch]$ValidarConfiguracao
)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.OwnerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) {
    throw 'Execute com a mesma conta do Windows usada na configuracao.'
}
$uri = $null
if (-not [Uri]::TryCreate($config.SistemaUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo) {
    throw 'URL HTTPS invalida.'
}
if (-not $config.Host -or -not $config.Database -or -not $config.User -or [int]$config.Port -lt 1 -or [int]$config.Port -gt 65535) {
    throw 'Configuracao do banco invalida.'
}
try {
    $password = ConvertTo-SecureString $config.PasswordEncrypted
    $token = ConvertTo-SecureString $config.TokenEncrypted
    if ($password.Length -eq 0 -or $token.Length -lt 32) { throw 'Invalid' }
} catch { throw 'Nao foi possivel ler os segredos. Configure novamente com esta conta neste PC.' }
if ($ValidarConfiguracao) { Write-Output 'Configuracao e segredos validos.'; return }
. (Join-Path $PSScriptRoot 'MySql-Nativo.ps1')
Initialize-SighraNative
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$endpoint = New-Object Uri($uri, '/api/integracoes/sighra')
$handler = New-Object Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$client = New-Object Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(10)
$client.DefaultRequestHeaders.Authorization = New-Object Net.Http.Headers.AuthenticationHeaderValue('Bearer', ([Net.NetworkCredential]::new('', $token).Password))
$logPath = Join-Path $PSScriptRoot 'ponte.log'
function Write-PonteLog([string]$Message) {
    $line = '{0} - {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 1MB) {
        Move-Item -LiteralPath $logPath -Destination ($logPath + '.anterior') -Force
    }
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}
function Invoke-SighraHttp([string]$Method, [string]$Path, $Body) {
    $request = New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::new($Method), ([Uri]::new($uri, $Path)))
    $response = $null
    try {
        if ($null -ne $Body) { $request.Content = New-Object Net.Http.StringContent(($Body | ConvertTo-Json -Depth 8 -Compress), [Text.Encoding]::UTF8, 'application/json') }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        if ([int]$response.StatusCode -eq 409) { return @{ expired = $true } }
        if (-not $response.IsSuccessStatusCode) { throw 'Sistema recusou a consulta.' }
        return ($response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
    } finally {
        if ($response) { $response.Dispose() }
        $request.Dispose()
    }
}
$nextHeartbeat = [DateTime]::MinValue
$pendingAnswer = $null
try {
    do {
      if ((Get-Date) -ge $nextHeartbeat) {
        $databaseOk = $false
        try {
            $databaseOk = Test-SighraConnection $config $password
            if (-not $databaseOk) { Write-PonteLog 'Banco indisponivel. Verifique rede e credenciais locais.' }
        } catch { Write-PonteLog 'Falha ao consultar o banco com a biblioteca existente do Sighra.' }
        $content = $null
        $response = $null
        $delivered = $false
        try {
            $payload = @{ database_ok = [bool]$databaseOk; query_enabled = $true } | ConvertTo-Json -Compress
            $content = New-Object Net.Http.StringContent($payload, [Text.Encoding]::UTF8, 'application/json')
            $response = $client.PostAsync($endpoint, $content).GetAwaiter().GetResult()
            $delivered = $response.IsSuccessStatusCode
            if ($delivered) { Write-PonteLog ('Sinal recebido pelo sistema; banco acessivel: ' + $databaseOk) }
            else { Write-PonteLog ('Sinal recusado pelo sistema; HTTP ' + [int]$response.StatusCode + '. Verifique chave, publicacao e migracao.') }
        } catch { Write-PonteLog 'Sinal nao entregue. Verifique internet e URL do sistema.' }
        finally {
            if ($response) { $response.Dispose() }
            if ($content) { $content.Dispose() }
        }
        $nextHeartbeat = (Get-Date).AddSeconds(30)
      }
      if ($databaseOk) {
        try {
            if ($null -eq $pendingAnswer) {
                $queue = Invoke-SighraHttp 'POST' '/api/integracoes/sighra/tarefas' $null
                if ($queue.job) {
                    Write-PonteLog ('Consultando macros do login ' + $queue.job.login)
                    $pendingAnswer = @{ id = $queue.job.id; lease_token = $queue.job.lease_token }
                    try { $pendingAnswer['result'] = Get-SighraDriverMacros $config $password $queue.job }
                    catch { $pendingAnswer['error'] = $true; Write-PonteLog 'Nao foi possivel consultar as macros no Sighra.' }
                }
            }
            if ($null -ne $pendingAnswer) {
                $answer = Invoke-SighraHttp 'PATCH' '/api/integracoes/sighra/tarefas' $pendingAnswer
                if ($answer.expired) { Write-PonteLog 'Pedido expirou; faca uma nova consulta no sistema.' }
                else { Write-PonteLog 'Resultado das macros recebido pelo sistema.' }
                $pendingAnswer = $null
            }
        } catch { Write-PonteLog 'Fila de consultas indisponivel; nova tentativa em alguns segundos.' }
      }
        if ($UmaVez) {
            if (-not $delivered -or -not $databaseOk) { throw 'Teste incompleto: consulte ponte.log.' }
            break
        }
        Start-Sleep -Seconds 5
    } while ($true)
} finally { $client.Dispose(); $handler.Dispose() }
