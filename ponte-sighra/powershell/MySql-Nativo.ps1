# Usa exclusivamente a biblioteca que ja existe no PC do Sighra.
function Protect-SighraConfig([string]$Path, [string]$OwnerSid) {
    $acl = New-Object Security.AccessControl.FileSecurity
    # Somente DACL: nao alterar dono, grupo ou auditoria (SACL), nem exigir SeSecurityPrivilege.
    $acl.SetSecurityDescriptorSddlForm(
        "D:P(A;;FA;;;${OwnerSid})(A;;FA;;;SY)(A;;FA;;;BA)",
        [Security.AccessControl.AccessControlSections]::Access
    )
    # API .NET aplica SIDs diretamente, sem resolucao de nomes pelo provedor Set-Acl.
    [IO.File]::SetAccessControl([IO.Path]::GetFullPath($Path), $acl)
}

function Assert-SighraLibrary {
    $dll = 'C:\SIGhRA_Monitor\libmysql.dll'
    if (-not (Test-Path -LiteralPath $dll -PathType Leaf)) { throw 'Biblioteca existente nao encontrada: C:\SIGhRA_Monitor\libmysql.dll. Nao instale nada; confira o caminho usado no script anterior.' }
    $stream = [IO.File]::OpenRead($dll)
    $reader = New-Object IO.BinaryReader($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'DLL invalida.' }
        $stream.Position = 0x3C
        $offset = $reader.ReadInt32()
        if ($offset -lt 0 -or $offset -gt $stream.Length - 6) { throw 'DLL invalida.' }
        $stream.Position = $offset
        if ($reader.ReadUInt32() -ne 0x4550) { throw 'DLL invalida.' }
        $machine = $reader.ReadUInt16()
        if ($machine -notin @(0x14C, 0x8664)) { throw 'Arquitetura da DLL nao suportada.' }
        if (($machine -eq 0x8664) -ne [Environment]::Is64BitProcess) {
            $folder = if ($machine -eq 0x14C) { 'SysWOW64' } else { 'System32' }
            throw ('Abra o PowerShell compativel com a DLL: C:\Windows\' + $folder + '\WindowsPowerShell\v1.0\powershell.exe')
        }
    } finally { $reader.Dispose(); $stream.Dispose() }
}

function Initialize-SighraNative {
    Assert-SighraLibrary
    if ('SighraBridgeNative' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SighraBridgeNative {
    private const string Dll = @"C:\SIGhRA_Monitor\libmysql.dll";
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr mysql_init(IntPtr mysql);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern IntPtr mysql_real_connect(IntPtr mysql, string host, string user, IntPtr password, string db, uint port, IntPtr socket, uint flags);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    public static extern int mysql_options(IntPtr mysql, int option, ref uint value);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    public static extern int mysql_query(IntPtr mysql, string query);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr mysql_store_result(IntPtr mysql);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr mysql_fetch_row(IntPtr result);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    public static extern void mysql_free_result(IntPtr result);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    public static extern void mysql_close(IntPtr mysql);
}
'@
}

function Test-SighraConnection($Config, [Security.SecureString]$Password) {
    $connection = [IntPtr]::Zero
    $result = [IntPtr]::Zero
    $passwordPtr = [IntPtr]::Zero
    try {
        $connection = [SighraBridgeNative]::mysql_init([IntPtr]::Zero)
        if ($connection -eq [IntPtr]::Zero) { return $false }
        # Enum mysql_option: CONNECT_TIMEOUT=0, READ_TIMEOUT=11, WRITE_TIMEOUT=12.
        foreach ($option in @(0, 11, 12)) {
            [uint32]$timeout = 10
            if ([SighraBridgeNative]::mysql_options($connection, $option, [ref]$timeout) -ne 0) { return $false }
        }
        $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocAnsi($Password)
        $connected = [SighraBridgeNative]::mysql_real_connect($connection, $Config.Host, $Config.User, $passwordPtr, $Config.Database, [uint32]$Config.Port, [IntPtr]::Zero, 0)
        if ($connected -eq [IntPtr]::Zero) { return $false }
        if ([SighraBridgeNative]::mysql_query($connection, 'SELECT 1 AS connection_ok') -ne 0) { return $false }
        $result = [SighraBridgeNative]::mysql_store_result($connection)
        if ($result -eq [IntPtr]::Zero) { return $false }
        $row = [SighraBridgeNative]::mysql_fetch_row($result)
        if ($row -eq [IntPtr]::Zero) { return $false }
        $value = [Runtime.InteropServices.Marshal]::ReadIntPtr($row)
        return $value -ne [IntPtr]::Zero -and [Runtime.InteropServices.Marshal]::PtrToStringAnsi($value) -eq '1'
    } finally {
        if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocAnsi($passwordPtr) }
        if ($result -ne [IntPtr]::Zero) { [SighraBridgeNative]::mysql_free_result($result) }
        if ($connection -ne [IntPtr]::Zero) { [SighraBridgeNative]::mysql_close($connection) }
    }
}

function Read-SighraMacros([IntPtr]$Connection, [string]$Sql) {
    $result = [IntPtr]::Zero
    try {
        if ([SighraBridgeNative]::mysql_query($Connection, $Sql) -ne 0) { throw 'Consulta das macros falhou.' }
        $result = [SighraBridgeNative]::mysql_store_result($Connection)
        if ($result -eq [IntPtr]::Zero) { throw 'Resultado das macros indisponivel.' }
        while ($true) {
            $row = [SighraBridgeNative]::mysql_fetch_row($result)
            if ($row -eq [IntPtr]::Zero) { break }
            $values = @()
            for ($i = 0; $i -lt 5; $i++) {
                $ptr = [Runtime.InteropServices.Marshal]::ReadIntPtr($row, $i * [IntPtr]::Size)
                $values += $(if ($ptr -eq [IntPtr]::Zero) { $null } else { [Runtime.InteropServices.Marshal]::PtrToStringAnsi($ptr) })
            }
            @{ login = $values[0].Trim(); name = $values[1].Trim(); gps_at = $values[2]; inserted_at = $values[3]; vehicle = $values[4] }
        }
    } finally { if ($result -ne [IntPtr]::Zero) { [SighraBridgeNative]::mysql_free_result($result) } }
}

function Get-SighraDriverMacros($Config, [Security.SecureString]$Password, $Job) {
    # Somente duas consultas fixas. Nenhum SQL recebido do sistema e executado.
    if ($Job.login -notmatch '^[0-9]{1,20}$' -or $Job.since_date -notmatch '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$') { throw 'Pedido invalido.' }
    $parsedDate = [DateTime]::MinValue
    if (-not [DateTime]::TryParseExact($Job.since_date, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$parsedDate)) { throw 'Periodo invalido.' }
    $connection = [IntPtr]::Zero
    $passwordPtr = [IntPtr]::Zero
    try {
        $connection = [SighraBridgeNative]::mysql_init([IntPtr]::Zero)
        if ($connection -eq [IntPtr]::Zero) { throw 'Conexao indisponivel.' }
        foreach ($option in @(0, 11, 12)) {
            [uint32]$timeout = 10
            if ([SighraBridgeNative]::mysql_options($connection, $option, [ref]$timeout) -ne 0) { throw 'Timeout indisponivel.' }
        }
        $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocAnsi($Password)
        $connected = [SighraBridgeNative]::mysql_real_connect($connection, $Config.Host, $Config.User, $passwordPtr, $Config.Database, [uint32]$Config.Port, [IntPtr]::Zero, 0)
        if ($connected -eq [IntPtr]::Zero) { throw 'Conexao indisponivel.' }
        $columns = "CAST(lmac_login AS CHAR), lmac_nome, DATE_FORMAT(lmac_data_gps, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(lmac_data_ins, '%Y-%m-%d %H:%i:%s'), CAST(lmac_cvei_id AS CHAR)"
        $filter = "lmac_login = '$($Job.login)' AND lmac_data_gps IS NOT NULL"
        $macros = @(Read-SighraMacros $connection "SELECT $columns FROM log_macro WHERE $filter ORDER BY lmac_data_gps DESC, lmac_data_ins DESC LIMIT 10")
        $ends = @(Read-SighraMacros $connection "SELECT $columns FROM log_macro WHERE $filter AND TRIM(lmac_nome) IN ('FIM DE JORNADA', 'FIM DE JORNADA GA') AND lmac_data_gps >= '$($Job.since_date)' ORDER BY lmac_data_gps DESC, lmac_data_ins DESC LIMIT 1")
        return @{ macros = $macros; last_end = $(if ($ends.Count) { $ends[0] } else { $null }) }
    } finally {
        if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocAnsi($passwordPtr) }
        if ($connection -ne [IntPtr]::Zero) { [SighraBridgeNative]::mysql_close($connection) }
    }
}
