#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$folder = Join-Path $root 'ponte-sighra\powershell'
foreach ($file in (Get-ChildItem -LiteralPath $folder -Filter '*.ps1')) {
    $tokens = $null
    $parseErrors = $null
    [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count -gt 0) { throw ('Erro de sintaxe: ' + $file.Name) }
}
$testFolder = Join-Path ([IO.Path]::GetTempPath()) ('sighra-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testFolder | Out-Null
$configPath = Join-Path $testFolder 'config.local.json'
try {
    $config = @{
        Host = 'localhost'; Port = 3306; Database = 'test'; User = 'test'; Driver = 'Test driver'
        SistemaUrl = 'https://example.com'
        OwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        PasswordEncrypted = (ConvertTo-SecureString 'test-only' -AsPlainText -Force | ConvertFrom-SecureString)
        TokenEncrypted = (ConvertTo-SecureString ('x' * 40) -AsPlainText -Force | ConvertFrom-SecureString)
    }
    $agent = Join-Path $folder 'Iniciar-Ponte.ps1'
    $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    $output = & $agent -ConfigPath $configPath -ValidarConfiguracao
    if ($output -ne 'Configuracao e segredos validos.') { throw 'Falha ao validar DPAPI.' }
    foreach ($invalid in @('url', 'conta', 'segredo', 'porta')) {
        $bad = $config.Clone()
        switch ($invalid) {
            'url' { $bad.SistemaUrl = 'http://example.com' }
            'conta' { $bad.OwnerSid = 'S-1-0-0' }
            'segredo' { $bad.TokenEncrypted = 'invalid' }
            'porta' { $bad.Port = 70000 }
        }
        $bad | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
        $rejected = $false
        try { & $agent -ConfigPath $configPath -ValidarConfiguracao | Out-Null } catch { $rejected = $true }
        if (-not $rejected) { throw ('Configuracao indevida aceita: ' + $invalid) }
    }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SighraBridgeNative {
    public static string Failure = "";
    public static int Closes, Frees;
    private static IntPtr row, value;
    public static IntPtr mysql_init(IntPtr p) { return new IntPtr(1); }
    public static int mysql_options(IntPtr p, int o, ref uint v) { return 0; }
    public static IntPtr mysql_real_connect(IntPtr p, string h, string u, IntPtr password, string d, uint port, IntPtr s, uint f) {
        if (Marshal.PtrToStringAnsi(password) != "test-only") throw new Exception("Secret conversion failed");
        return Failure == "connect" ? IntPtr.Zero : p;
    }
    public static int mysql_query(IntPtr p, string q) {
        if (q != "SELECT 1 AS connection_ok") throw new Exception("Unexpected SQL");
        return Failure == "query" ? 1 : 0;
    }
    public static IntPtr mysql_store_result(IntPtr p) { return Failure == "result" ? IntPtr.Zero : new IntPtr(2); }
    public static IntPtr mysql_fetch_row(IntPtr p) {
        if (Failure == "row") return IntPtr.Zero;
        value = Marshal.StringToHGlobalAnsi("1"); row = Marshal.AllocHGlobal(IntPtr.Size);
        Marshal.WriteIntPtr(row, value); return row;
    }
    public static void mysql_free_result(IntPtr p) {
        Frees++;
        if (row != IntPtr.Zero) { Marshal.FreeHGlobal(row); row = IntPtr.Zero; }
        if (value != IntPtr.Zero) { Marshal.FreeHGlobal(value); value = IntPtr.Zero; }
    }
    public static void mysql_close(IntPtr p) { Closes++; }
}
'@
    . (Join-Path $folder 'MySql-Nativo.ps1')
    $password = ConvertTo-SecureString 'test-only' -AsPlainText -Force
    foreach ($failure in @('', 'connect', 'query', 'result', 'row')) {
        [SighraBridgeNative]::Failure = $failure
        [SighraBridgeNative]::Closes = 0
        [SighraBridgeNative]::Frees = 0
        $ok = Test-SighraConnection ([pscustomobject]$config) $password
        if ($ok -ne ($failure -eq '') -or [SighraBridgeNative]::Closes -ne 1) { throw 'Falha na limpeza da conexao nativa.' }
        $expectedFrees = if ($failure -in @('', 'row')) { 1 } else { 0 }
        if ([SighraBridgeNative]::Frees -ne $expectedFrees) { throw 'Falha na limpeza do resultado nativo.' }
    }
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object Net.Http.HttpClient($handler)
    $client.DefaultRequestHeaders.Authorization = New-Object Net.Http.Headers.AuthenticationHeaderValue('Bearer', 'test-only')
    $client.Dispose()
    $handler.Dispose()
    Write-Output 'OK: sintaxe PS5.1, DPAPI, rejeicao de configuracoes, API nativa simulada, limpeza e HTTP.'
} finally {
    # Alvo criado pelo proprio teste, validado antes da exclusao recursiva.
    $resolved = [IO.Path]::GetFullPath($testFolder)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'sighra-test-*') {
        throw 'Diretorio temporario inesperado.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
