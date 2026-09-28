# Usa exclusivamente a biblioteca que ja existe no PC do Sighra.
function Protect-SighraConfig([string]$Path, [string]$OwnerSid) {
    $acl = New-Object Security.AccessControl.FileSecurity
    # Somente DACL: nao alterar dono, grupo ou auditoria (SACL), nem exigir SeSecurityPrivilege.
    $acl.SetSecurityDescriptorSddlForm(
        "D:P(A;;FA;;;${OwnerSid})(A;;FA;;;SY)(A;;FA;;;BA)",
        [Security.AccessControl.AccessControlSections]::Access
    )
    # API .NET aplica SIDs diretamente, sem resolucao de nomes pelo provedor Set-Acl.
    $fullPath = [IO.Path]::GetFullPath($Path)
    if ($null -ne [IO.File].GetMethod('SetAccessControl', [type[]]@([string], [Security.AccessControl.FileSecurity]))) {
        [IO.File]::SetAccessControl($fullPath, $acl)
    } else {
        # PowerShell 7/.NET moderno moveu as APIs de ACL para FileSystemAclExtensions.
        [IO.FileSystemAclExtensions]::SetAccessControl([IO.FileInfo]::new($fullPath), $acl)
    }
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
    public static extern IntPtr mysql_error(IntPtr mysql);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    public static extern uint mysql_errno(IntPtr mysql);
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
            [uint32]$timeout = if ($option -eq 11) { 60 } else { 10 }
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
        if ([SighraBridgeNative]::mysql_query($Connection, $Sql) -ne 0) {
            $number = [SighraBridgeNative]::mysql_errno($Connection)
            $detail = [Runtime.InteropServices.Marshal]::PtrToStringAnsi([SighraBridgeNative]::mysql_error($Connection))
            # Somente erro SQL local; nunca transmitir SQL, senha ou mensagem da macro.
            throw ('Consulta das macros falhou. MySQL ' + $number + ': ' + $detail)
        }
        $result = [SighraBridgeNative]::mysql_store_result($Connection)
        if ($result -eq [IntPtr]::Zero) { throw 'Resultado das macros indisponivel.' }
        while ($true) {
            $row = [SighraBridgeNative]::mysql_fetch_row($result)
            if ($row -eq [IntPtr]::Zero) { break }
            $values = @()
            for ($i = 0; $i -lt 13; $i++) {
                $ptr = [Runtime.InteropServices.Marshal]::ReadIntPtr($row, $i * [IntPtr]::Size)
                $values += $(if ($ptr -eq [IntPtr]::Zero) { $null } else { [Runtime.InteropServices.Marshal]::PtrToStringAnsi($ptr) })
            }
            $latitude = $null
            $longitude = $null
            if ($null -ne $values[10]) { $latitude = [double]::Parse($values[10], [Globalization.CultureInfo]::InvariantCulture) }
            if ($null -ne $values[11]) { $longitude = [double]::Parse($values[11], [Globalization.CultureInfo]::InvariantCulture) }
            if ($latitude -eq 0 -and $longitude -eq 0) { $latitude = $null; $longitude = $null }
            @{ login = $values[0].Trim(); name = $values[1].Trim(); gps_at = $values[2]; inserted_at = $values[3]; vehicle = $values[4];
               plate = $values[5]; point = $values[6]; city = $values[7]; state = $values[8]; street = $values[9]; latitude = $latitude; longitude = $longitude;
               id = $values[12] }
        }
    } finally { if ($result -ne [IntPtr]::Zero) { [SighraBridgeNative]::mysql_free_result($result) } }
}

function Get-SighraDriverMacros($Config, [Security.SecureString]$Password, $Job) {
    # Somente consultas fixas. Nenhum SQL recebido do sistema e executado.
    if ($Job.login -notmatch '^[0-9]{1,20}$' -or $Job.since_date -notmatch '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$') { throw 'Pedido invalido.' }
    $parsedDate = [DateTime]::MinValue
    if (-not [DateTime]::TryParseExact($Job.since_date, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$parsedDate)) { throw 'Periodo invalido.' }
    $connection = [IntPtr]::Zero
    $passwordPtr = [IntPtr]::Zero
    try {
        $connection = [SighraBridgeNative]::mysql_init([IntPtr]::Zero)
        if ($connection -eq [IntPtr]::Zero) { throw 'Conexao indisponivel.' }
        foreach ($option in @(0, 11, 12)) {
            # A tabela de macros pode levar mais de 10 segundos pela VPN. A
            # conexão e a escrita continuam limitadas a 10 segundos.
            [uint32]$timeout = if ($option -eq 11) { 60 } else { 10 }
            if ([SighraBridgeNative]::mysql_options($connection, $option, [ref]$timeout) -ne 0) { throw 'Timeout indisponivel.' }
        }
        $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocAnsi($Password)
        $connected = [SighraBridgeNative]::mysql_real_connect($connection, $Config.Host, $Config.User, $passwordPtr, $Config.Database, [uint32]$Config.Port, [IntPtr]::Zero, 0)
        if ($connected -eq [IntPtr]::Zero) { throw 'Conexao indisponivel.' }
        $columns = "CAST(m.lmac_login AS CHAR), m.lmac_nome, DATE_FORMAT(m.lmac_data_gps, '%Y-%m-%d %H:%i:%s'), DATE_FORMAT(m.lmac_data_ins, '%Y-%m-%d %H:%i:%s'), CAST(m.lmac_cvei_id AS CHAR), v.cvei_placa, p.cpnt_descricao, p.cpnt_cidade, p.cpnt_uf, r.crua_nome, m.lmac_latitude, m.lmac_longitude, MD5(CONCAT_WS('|', CAST(m.lmac_login AS CHAR), m.lmac_nome, DATE_FORMAT(m.lmac_data_gps, '%Y-%m-%d %H:%i:%s'), CAST(m.lmac_cvei_id AS CHAR)))"
        $joins = "LEFT JOIN cad_veiculo v ON v.cvei_id = m.lmac_cvei_id LEFT JOIN cad_ponto p ON p.cpnt_id = m.lmac_cpnt_id LEFT JOIN cad_ruas r ON r.crua_id = m.lmac_crua_id"
        $eventColumns = 'lmac_login, lmac_nome, lmac_data_gps, lmac_data_ins, lmac_cvei_id, lmac_cpnt_id, lmac_crua_id, lmac_latitude, lmac_longitude'
        $filter = "lmac_login = '$($Job.login)' AND lmac_data_gps IS NOT NULL"
        # Limitar as macros antes dos joins evita ordenar toda a tabela com os cadastros.
        $macros = @(Read-SighraMacros $connection "SELECT $columns FROM (SELECT $eventColumns FROM log_macro WHERE $filter ORDER BY lmac_data_gps DESC LIMIT 10) m $joins ORDER BY m.lmac_data_gps DESC")
        $ends = @(Read-SighraMacros $connection "SELECT $columns FROM (SELECT $eventColumns FROM log_macro WHERE $filter AND TRIM(lmac_nome) IN ('FIM DE JORNADA', 'FIM DE JORNADA GA') AND lmac_data_gps >= '$($Job.since_date)' ORDER BY lmac_data_gps DESC LIMIT 1) m $joins ORDER BY m.lmac_data_gps DESC")
        # O piloto precisa da sequência, em ordem cronológica, para parear cada início com o fim posterior.
        $journeyFilter = "UPPER(TRIM(lmac_nome)) IN ('INÍCIO DE JORNADA', 'INICIO DE JORNADA', 'INÍCIO DE JORNADA GA', 'INICIO DE JORNADA GA', 'FIM DE JORNADA', 'FIM DE JORNADA GA')"
        $journeyEvents = @(Read-SighraMacros $connection "SELECT $columns FROM (SELECT $eventColumns FROM log_macro WHERE $filter AND $journeyFilter AND lmac_data_gps >= '$($Job.since_date)' ORDER BY lmac_data_gps DESC LIMIT 40) m $joins ORDER BY m.lmac_data_gps ASC")
        $restartFilter = "UPPER(TRIM(lmac_nome)) IN ('REINÍCIO DE VIAGEM', 'REINICIO DE VIAGEM', 'REINÍCIO DE VIAGEM GA', 'REINICIO DE VIAGEM GA')"
        $restartEvents = @(Read-SighraMacros $connection "SELECT $columns FROM (SELECT $eventColumns FROM log_macro WHERE $filter AND $restartFilter AND lmac_data_gps >= '$($Job.since_date)' ORDER BY lmac_data_gps ASC LIMIT 80) m $joins ORDER BY m.lmac_data_gps ASC")
        return @{ macros = $macros; last_end = $(if ($ends.Count) { $ends[0] } else { $null }); journey_events = $journeyEvents; restart_events = $restartEvents }
    } finally {
        if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocAnsi($passwordPtr) }
        if ($connection -ne [IntPtr]::Zero) { [SighraBridgeNative]::mysql_close($connection) }
    }
}
