# Usa exclusivamente a biblioteca que ja existe no PC do Sighra.
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
