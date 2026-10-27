# Datatex NOW / PRO ODBC diagnostic
# Read-only. Runs under 32-bit Windows PowerShell 5.1 and uses the existing ADODB/ODBC stack.
[CmdletBinding()]
param(
    [string]$Dsn = "PRO",
    [int]$SampleLimit = 10
)

$ErrorActionPreference = "Stop"
$stage = "preflight"
$connection = $null
$recordset = $null
$password = $null
$connectionString = $null

function Write-Stage {
    param([string]$Name, [string]$Status, [string]$Detail = "")
    $line = "{0,-28} {1,-8} {2}" -f $Name, $Status, $Detail
    Write-Host $line
}

function Get-SafeError {
    param([object]$ErrorRecord)
    $message = [string]$ErrorRecord.Exception.Message
    $message = $message -replace '(?i)(PWD|PASSWORD)\s*=\s*[^;\s]+', '$1=[redacted]'
    $message = $message -replace '(?i)(UID|USER ID)\s*=\s*[^;\s]+', '$1=[redacted]'
    return $message
}

function Invoke-ReadQuery {
    param([object]$Connection, [string]$Sql)
    $rs = $Connection.Execute($Sql)
    return ,$rs
}

function Get-FieldValue {
    param([object]$Record, [string]$Name)
    try { return [string]$Record.Fields.Item($Name).Value } catch { return "" }
}

function Mask-Code {
    param([string]$Code)
    if ([string]::IsNullOrWhiteSpace($Code)) { return "(vacío)" }
    if ($Code.Length -le 2) { return "*" * $Code.Length }
    return $Code.Substring(0, 1) + ("*" * [Math]::Min(8, $Code.Length - 2)) + $Code.Substring($Code.Length - 1, 1)
}

try {
    Write-Host "Datatex NOW - diagnóstico ODBC de solo lectura"
    Write-Host "DSN solicitado: $Dsn"
    Write-Host ""

    $processBits = [IntPtr]::Size * 8
    $osBits = if ($env:PROCESSOR_ARCHITEW6432) { 64 } else { $processBits }
    Write-Stage "Proceso PowerShell" "$processBits-bit" "Windows: $osBits-bit"

    if ($processBits -ne 32) {
        Write-Stage "Compatibilidad ODBC" "ERROR" "El controlador indicado es de 32 bits."
        Write-Host ""
        Write-Host "Ejecuta desde CMD con:"
        Write-Host '"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File ".\Test-DatatexNow.ps1"'
        exit 2
    }
    Write-Stage "Compatibilidad ODBC" "OK" "Proceso de 32 bits compatible con el controlador indicado"

    $dsnRegistry = "Registry::HKEY_CURRENT_USER\Software\ODBC\ODBC.INI\ODBC Data Sources"
    if (-not (Test-Path -LiteralPath $dsnRegistry)) {
        Write-Stage "DSN de usuario $Dsn" "NO" "No aparece en el registro de DSN de usuario."
        Write-Host "Comprueba el DSN con el administrador ODBC de 32 bits."
        exit 3
    }

    $dsnSources = Get-ItemProperty -LiteralPath $dsnRegistry
    $dsnProperty = $dsnSources.PSObject.Properties | Where-Object { $_.Name -eq $Dsn } | Select-Object -First 1
    if (-not $dsnProperty) {
        Write-Stage "DSN de usuario $Dsn" "NO" "No aparece en el registro de DSN de usuario."
        Write-Host "Comprueba que PRO esté creado como DSN de usuario de 32 bits."
        exit 3
    }

    $driverName = [string]$dsnProperty.Value
    Write-Stage "DSN de usuario $Dsn" "OK" "Controlador registrado: $driverName"

    $driversRegistry = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\ODBC\ODBCINST.INI\ODBC Drivers"
    $driverFound = $false
    if (Test-Path -LiteralPath $driversRegistry) {
        $driverProperties = Get-ItemProperty -LiteralPath $driversRegistry
        $driverFound = $null -ne ($driverProperties.PSObject.Properties | Where-Object { $_.Name -eq $driverName } | Select-Object -First 1)
    }
    if ($driverFound) {
        Write-Stage "Controlador ODBC de 32 bits" "OK" $driverName
    } else {
        Write-Stage "Controlador ODBC de 32 bits" "REVISAR" "No se pudo confirmar el registro del controlador con ese nombre."
    }

    $stage = "credenciales"
    $userName = Read-Host "Usuario Oracle autorizado (la contraseña no se guarda)"
    if ([string]::IsNullOrWhiteSpace($userName)) {
        Write-Stage "Credenciales" "ERROR" "El usuario no puede estar vacío."
        exit 4
    }
    $securePassword = Read-Host "Contraseña Oracle autorizada" -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
        $securePassword.Dispose()
    }

    $connectionString = "DSN=$Dsn;UID=$userName;PWD=$password"
    $stage = "conexión ODBC"
    $connection = New-Object -ComObject ADODB.Connection
    $connection.CommandTimeout = 20
    $connection.ConnectionTimeout = 15
    $connection.Open($connectionString)
    $connectionString = $null
    $password = $null
    $userName = $null
    Write-Stage "Conexión ODBC" "OK" "Conexión establecida; no se muestra ni guarda la cadena."

    $stage = "consulta de control"
    $rs = Invoke-ReadQuery -Connection $connection -Sql "SELECT 1 AS TEST_VALUE FROM DUAL"
    try {
        $value = [string]$rs.Fields.Item("TEST_VALUE").Value
        if ($value -ne "1") { throw "La consulta de control devolvió un resultado inesperado." }
    } finally {
        if ($rs -and $rs.State -ne 0) { $rs.Close() }
        if ($rs) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($rs) }
    }
    Write-Stage "SELECT 1 FROM DUAL" "OK" "Lectura básica confirmada"

    $stage = "permisos de tablas"
    $accessSql = @"
SELECT
    F.SUBCODE01, F.SUBCODE02, F.LONGDESCRIPTION, F.SHORTDESCRIPTION,
    H.LOGICALWAREHOUSECODE, H.DECOSUBCODE01 AS BALANCE_SUBCODE01, H.DECOSUBCODE02 AS BALANCE_SUBCODE02,
    H.WAREHOUSELOCATIONCODE, H.WHSLOCATIONWAREHOUSEZONECODE,
    H.BASEPRIMARYQUANTITYUNIT, H.ITEMTYPECODE, H.BASEPRIMARYUNITCODE
FROM NOW.BALANCE H, NOW.PRODUCT F
WHERE 1 = 0
"@
    $rs = Invoke-ReadQuery -Connection $connection -Sql $accessSql
    try {
        # Opening the zero-row query checks object and column access without reading inventory data.
        [void]$rs.Fields.Count
    } finally {
        if ($rs -and $rs.State -ne 0) { $rs.Close() }
        if ($rs) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($rs) }
    }
    Write-Stage "Lectura NOW.BALANCE / PRODUCT" "OK" "Permiso de lectura y columnas de referencia comprobados"

    $stage = "muestra limitada"
    $safeLimit = [Math]::Max(1, [Math]::Min(50, $SampleLimit))
    $sampleSql = @"
SELECT
    F.SUBCODE01, F.SUBCODE02, F.LONGDESCRIPTION, F.SHORTDESCRIPTION,
    H.LOGICALWAREHOUSECODE, H.DECOSUBCODE01, H.DECOSUBCODE02,
    H.WAREHOUSELOCATIONCODE, H.WHSLOCATIONWAREHOUSEZONECODE,
    H.BASEPRIMARYQUANTITYUNIT, H.ITEMTYPECODE, H.BASEPRIMARYUNITCODE
FROM NOW.BALANCE H, NOW.PRODUCT F
WHERE H.LOGICALWAREHOUSECODE IN ('QA','Q1')
  AND F.SUBCODE01 = H.DECOSUBCODE01
  AND F.SUBCODE02 = H.DECOSUBCODE02
  AND H.ITEMTYPECODE = 'Q'
  AND ROWNUM <= $safeLimit
"@
    $rs = Invoke-ReadQuery -Connection $connection -Sql $sampleSql
    $sampleCount = 0
    $examples = @()
    try {
        while (-not $rs.EOF) {
            $sampleCount++
            if ($examples.Count -lt 5) {
                $code = "$(Get-FieldValue -Record $rs -Name 'BALANCE_SUBCODE01')-$(Get-FieldValue -Record $rs -Name 'BALANCE_SUBCODE02')"
                $warehouse = Get-FieldValue -Record $rs -Name "LOGICALWAREHOUSECODE"
                $examples += "$warehouse / $(Mask-Code $code)"
            }
            $rs.MoveNext()
        }
    } finally {
        if ($rs -and $rs.State -ne 0) { $rs.Close() }
        if ($rs) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($rs) }
    }

    Write-Stage "Muestra de QA/Q1 tipo Q" "OK" "$sampleCount fila(s), máximo $safeLimit; no es un conteo total."
    if ($examples.Count -gt 0) {
        Write-Host "Ejemplos enmascarados (almacén / código):"
        $examples | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "La consulta limitada no devolvió filas. Esto no demuestra que el saldo total sea cero."
    }

    Write-Host ""
    Write-Host "RESULTADO: diagnóstico ODBC completado. No se modificó Oracle y no se transmitieron datos."
    exit 0
}
catch {
    $message = Get-SafeError $_
    Write-Stage $stage "ERROR" $message
    Write-Host ""
    Write-Host "No se interpreta un error como saldo cero. No se guardaron contraseñas ni resultados detallados."
    exit 1
}
finally {
    $connectionString = $null
    $password = $null
    if ($recordset) {
        try { if ($recordset.State -ne 0) { $recordset.Close() } } catch {}
        try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($recordset) } catch {}
    }
    if ($connection) {
        try { if ($connection.State -ne 0) { $connection.Close() } } catch {}
        try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($connection) } catch {}
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
