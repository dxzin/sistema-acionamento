#requires -Version 5.1
[CmdletBinding()]
param([string]$ServidorTeste = 'http://192.168.1.143:3100')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'MySql-Nativo.ps1')
Assert-SighraLibrary

$uri = $null
$valid = [Uri]::TryCreate($ServidorTeste, [UriKind]::Absolute, [ref]$uri) -and $uri.Scheme -eq 'http' -and -not $uri.UserInfo -and (
    $uri.Host -match '^10\.' -or $uri.Host -match '^192\.168\.' -or $uri.Host -match '^172\.(1[6-9]|2[0-9]|3[01])\.'
)
if (-not $valid) { throw 'Informe o endereco HTTP privado exibido no arquivo LEIA-ME-PRIMEIRO.txt.' }
$pairingPath = Join-Path $PSScriptRoot 'CHAVE-PAREAMENTO-TESTE.txt'
if (-not (Test-Path -LiteralPath $pairingPath -PathType Leaf)) { throw 'Chave de pareamento ausente. Copie novamente o pacote completo.' }
$tokenText = (Get-Content -LiteralPath $pairingPath -Raw).Trim()
if ($tokenText.Length -lt 32) { throw 'Chave de pareamento invalida.' }

function Read-Default([string]$Prompt, [string]$Default) {
    $value = Read-Host ($Prompt + ' [' + $Default + ']')
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value.Trim()
}
$hostName = Read-Default 'Host do banco SIGhRA acessivel pelo notebook' '192.168.0.4'
$database = Read-Default 'Banco' 'mclient'
$userName = Read-Default 'Usuario' 'monitor'
$password = Read-Host 'Senha do banco SIGhRA' -AsSecureString
if ($password.Length -eq 0) { throw 'A senha nao pode ficar vazia.' }
$token = ConvertTo-SecureString $tokenText -AsPlainText -Force
$configPath = Join-Path $PSScriptRoot 'config.notebook-teste.local.json'
$config = [ordered]@{
    Host = $hostName; Port = 3306; Database = $database; User = $userName
    SistemaUrl = $uri.GetLeftPart([UriPartial]::Authority)
    LocalTest = $true; AllowPrivateTestServer = $true
    OwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    PasswordEncrypted = ($password | ConvertFrom-SecureString)
    TokenEncrypted = ($token | ConvertFrom-SecureString)
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Protect-SighraConfig $configPath $config.OwnerSid
Remove-Item -LiteralPath $pairingPath -Force
Write-Host 'Notebook pareado somente com o servidor de teste. A chave de transporte foi removida.' -ForegroundColor Green
Write-Host 'Agora execute .\Iniciar-Ponte-Teste-Remota.ps1'
