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
    public static bool MacroMode, Empty;
    private static int rowCount;
    private static IntPtr[] fields;
    private static IntPtr row, value;
    public static IntPtr mysql_init(IntPtr p) { return new IntPtr(1); }
    public static int mysql_options(IntPtr p, int o, ref uint v) { return 0; }
    public static IntPtr mysql_real_connect(IntPtr p, string h, string u, IntPtr password, string d, uint port, IntPtr s, uint f) {
        if (Marshal.PtrToStringAnsi(password) != "test-only") throw new Exception("Secret conversion failed");
        return Failure == "connect" ? IntPtr.Zero : p;
    }
    public static int mysql_query(IntPtr p, string q) {
        if (MacroMode) {
            if (!q.StartsWith("SELECT CAST(m.lmac_login AS CHAR)") || q.Contains("lmac_msg") || !q.Contains("LIMIT ") || q.Contains("DESC, lmac_data_ins") || !q.Contains("v.cvei_id = m.lmac_cvei_id") || !q.Contains("p.cpnt_id = m.lmac_cpnt_id") || !q.Contains("r.crua_id = m.lmac_crua_id")) throw new Exception("Unexpected macro SQL");
            rowCount = 0;
        } else if (q != "SELECT 1 AS connection_ok") throw new Exception("Unexpected SQL");
        return Failure == "query" ? 1 : 0;
    }
    public static IntPtr mysql_store_result(IntPtr p) { return Failure == "result" ? IntPtr.Zero : new IntPtr(2); }
    public static uint mysql_errno(IntPtr p) { return 2013; }
    public static IntPtr mysql_error(IntPtr p) {
        value = Marshal.StringToHGlobalAnsi("Lost connection to MySQL server during query"); return value;
    }
    public static IntPtr mysql_fetch_row(IntPtr p) {
        if (MacroMode) {
            if (Empty || rowCount++ > 0) return IntPtr.Zero;
            string[] values = { "30049", "FIM DE JORNADA GA", "2026-09-16 12:20:33", null, "220842", "ABC1D23", "Garagem", "Sao Paulo", "SP", null, "-23.55", "-46.63", "macro-test-id" };
            fields = new IntPtr[13]; row = Marshal.AllocHGlobal(IntPtr.Size * 13);
            for (int i=0; i<13; i++) {
                fields[i] = values[i] == null ? IntPtr.Zero : Marshal.StringToHGlobalAnsi(values[i]);
                Marshal.WriteIntPtr(row, i * IntPtr.Size, fields[i]);
            }
            return row;
        }
        if (Failure == "row") return IntPtr.Zero;
        value = Marshal.StringToHGlobalAnsi("1"); row = Marshal.AllocHGlobal(IntPtr.Size);
        Marshal.WriteIntPtr(row, value); return row;
    }
    public static void mysql_free_result(IntPtr p) {
        Frees++;
        if (row != IntPtr.Zero) { Marshal.FreeHGlobal(row); row = IntPtr.Zero; }
        if (value != IntPtr.Zero) { Marshal.FreeHGlobal(value); value = IntPtr.Zero; }
        if (fields != null) { foreach (IntPtr field in fields) if (field != IntPtr.Zero) Marshal.FreeHGlobal(field); fields = null; }
    }
    public static void mysql_close(IntPtr p) {
        Closes++;
        if (value != IntPtr.Zero) { Marshal.FreeHGlobal(value); value = IntPtr.Zero; }
    }
}
'@
    . (Join-Path $folder 'MySql-Nativo.ps1')
    Protect-SighraConfig $configPath $config.OwnerSid
    $acl = [IO.File]::GetAccessControl($configPath)
    $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    if (-not $acl.AreAccessRulesProtected -or $rules.Count -ne 3 -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $config.OwnerSid) {
        throw 'Permissoes do arquivo de configuracao incorretas.'
    }
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
    [SighraBridgeNative]::Failure = ''
    [SighraBridgeNative]::MacroMode = $true
    [SighraBridgeNative]::Closes = 0
    [SighraBridgeNative]::Frees = 0
    $job = [pscustomobject]@{ login = '30049'; since_date = '2026-08-18' }
    $result = Get-SighraDriverMacros ([pscustomobject]$config) $password $job
    if ($result.macros.Count -ne 1 -or $result.macros[0].id -ne 'macro-test-id' -or $result.last_end.gps_at -ne '2026-09-16 12:20:33' -or $null -ne $result.last_end.inserted_at -or [SighraBridgeNative]::Closes -ne 1 -or [SighraBridgeNative]::Frees -ne 4) { throw 'Resultado ou limpeza das macros incorretos.' }
    if ($result.macros[0].plate -ne 'ABC1D23' -or $result.macros[0].point -ne 'Garagem' -or $null -ne $result.macros[0].street -or $result.macros[0].latitude -ne -23.55 -or $result.macros[0].longitude -ne -46.63) { throw 'Placa ou local da macro incorretos.' }
    [SighraBridgeNative]::Empty = $true
    $empty = Get-SighraDriverMacros ([pscustomobject]$config) $password $job
    if ($empty.macros.Count -ne 0 -or $null -ne $empty.last_end) { throw 'Consulta vazia incorreta.' }
    [SighraBridgeNative]::Failure = 'query'
    [SighraBridgeNative]::Closes = 0
    $diagnosed = $false
    try { Get-SighraDriverMacros ([pscustomobject]$config) $password $job | Out-Null }
    catch { $diagnosed = $_.Exception.Message -like '*MySQL 2013: Lost connection*' }
    if (-not $diagnosed -or [SighraBridgeNative]::Closes -ne 1) { throw 'Erro SQL sem diagnostico ou conexao nao liberada.' }
    [SighraBridgeNative]::Failure = ''
    $rejected = $false
    try { Get-SighraDriverMacros ([pscustomobject]$config) $password ([pscustomobject]@{ login = '30049 OR 1=1'; since_date = '2026-08-18' }) | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Login indevido aceito na ponte.' }
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
