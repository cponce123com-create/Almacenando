# Local Datatex NOW connector. Read-only Oracle queries; outbound HTTPS only.
[CmdletBinding()]
param(
    [string]$Dsn = "PRO",
    [int]$PollSeconds = 10,
    [int]$MaxRawRows = 5000
)

$ErrorActionPreference = "Stop"
$apiRoot = $env:ALMACENANDO_API_URL
$tokenSecure = $null
$token = $null
$script:oracleUserName = $null
$script:oracleSecurePassword = $null

if ([IntPtr]::Size -ne 4) {
    throw "Ejecuta este conector con Windows PowerShell de 32 bits (SysWOW64)."
}
if ([string]::IsNullOrWhiteSpace($apiRoot) -or -not $apiRoot.StartsWith("https://")) {
    throw "Configura ALMACENANDO_API_URL con la URL HTTPS aprobada de ALMACENANDO."
}
$apiRoot = $apiRoot.TrimEnd("/")
$tokenSecure = Read-Host "Token del conector configurado por el administrador de ALMACENANDO" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer) }
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $tokenSecure.Dispose()
}
if ([string]::IsNullOrWhiteSpace($token)) { throw "El token no puede estar vacío." }

$script:oracleUserName = Read-Host "Usuario Oracle autorizado"
if ([string]::IsNullOrWhiteSpace($script:oracleUserName)) { throw "El usuario Oracle no puede estar vacío." }
$script:oracleSecurePassword = Read-Host "Contraseña Oracle autorizada" -AsSecureString
if ($script:oracleSecurePassword.Length -eq 0) { throw "La contraseña Oracle no puede estar vacía." }

$headers = @{ "x-datatex-token" = $token }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-Field {
    param([object]$Record, [string]$Name)
    return $Record.Fields.Item($Name).Value
}
function Get-TextField {
    param([object]$Record, [string]$Name)
    $value = Get-Field -Record $Record -Name $Name
    if ($null -eq $value -or $value -is [DBNull]) { return "" }
    return [Convert]::ToString($value, [Globalization.CultureInfo]::InvariantCulture).Trim()
}
function Get-JoinedValues {
    param([hashtable]$Values)
    return (@($Values.Keys | Sort-Object) -join " | ")
}
function Send-Failure {
    param([string]$RequestId, [string]$Message)
    try {
        $body = @{ error = $Message } | ConvertTo-Json -Compress
        Invoke-RestMethod -Method Post -Uri "$apiRoot/connector/$RequestId/fail" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
    } catch {
        Write-Host "No se pudo informar el error a ALMACENANDO; verifica la conexión HTTPS."
    }
}
function Invoke-Extraction {
    param([string]$RequestId)
    $connection = $null
    $recordset = $null
    $password = $null
    $connectionString = $null
    $stage = "conexión Oracle"
    try {
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($script:oracleSecurePassword)
        try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
        $connectionString = "DSN=$Dsn;UID=$script:oracleUserName;PWD=$password"
        $connection = New-Object -ComObject ADODB.Connection
        $connection.ConnectionTimeout = 15
        $connection.CommandTimeout = 120
        $connection.Open($connectionString)
        $connectionString = $null
        $password = $null
        $stage = "verificación de productos"
        $duplicateSql = @"
SELECT SUBCODE01, SUBCODE02, COUNT(*) AS DUPLICATE_COUNT
FROM NOW.PRODUCT
GROUP BY SUBCODE01, SUBCODE02
HAVING COUNT(*) > 1
"@
        $recordset = $connection.Execute($duplicateSql)
        $duplicateCount = 0
        try {
            while (-not $recordset.EOF) {
                $duplicateCount++
                $recordset.MoveNext()
            }
        } finally {
            if ($recordset.State -ne 0) { $recordset.Close() }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($recordset)
            $recordset = $null
        }
        if ($duplicateCount -gt 0) {
            throw "Hay $duplicateCount códigos tipo Q repetidos en NOW.PRODUCT; se cancela la extracción para evitar inflar saldos por el JOIN."
        }

        $stage = "lectura de saldos"
        $sql = @"
SELECT
    F.SUBCODE01,
    F.SUBCODE02,
    F.LONGDESCRIPTION,
    F.SHORTDESCRIPTION,
    H.LOGICALWAREHOUSECODE,
    H.DECOSUBCODE01 AS BALANCE_SUBCODE01,
    H.DECOSUBCODE02 AS BALANCE_SUBCODE02,
    H.WAREHOUSELOCATIONCODE,
    H.WHSLOCATIONWAREHOUSEZONECODE,
    H.BASEPRIMARYQUANTITYUNIT AS BALANCE_QUANTITY,
    H.ITEMTYPECODE,
    H.BASEPRIMARYUNITCODE
FROM NOW.BALANCE H, NOW.PRODUCT F
WHERE H.LOGICALWAREHOUSECODE IN ('QA','Q1')
  AND F.SUBCODE01 = H.DECOSUBCODE01
  AND F.SUBCODE02 = H.DECOSUBCODE02
  AND H.ITEMTYPECODE = 'Q'
"@
        $recordset = $connection.Execute($sql)
        $groups = @{}
        $rawCount = 0
        try {
            while (-not $recordset.EOF) {
                $rawCount++
                if ($rawCount -gt $MaxRawRows) {
                    throw "La extracción excede el límite seguro de $MaxRawRows filas sin consolidar."
                }
                $warehouse = Get-TextField $recordset "LOGICALWAREHOUSECODE"
                $code01 = Get-TextField $recordset "BALANCE_SUBCODE01"
                $code02 = Get-TextField $recordset "BALANCE_SUBCODE02"
                $code = "$code01-$code02"
                $unit = Get-TextField $recordset "BASEPRIMARYUNITCODE"
                $description = Get-TextField $recordset "LONGDESCRIPTION"
                $shortDescription = Get-TextField $recordset "SHORTDESCRIPTION"
                $quantityValue = Get-Field $recordset "BALANCE_QUANTITY"
                if ($warehouse -notin @("QA", "Q1") -or $code01 -eq "" -or $code02 -eq "" -or $description -eq "" -or $unit -eq "") {
                    throw "La consulta devolvió una fila incompleta; no se convertirá en un saldo cero."
                }
                if ($null -eq $quantityValue -or $quantityValue -is [DBNull]) {
                    throw "La consulta devolvió una cantidad nula; la extracción se rechaza para revisión."
                }
                $quantityText = [Convert]::ToString($quantityValue, [Globalization.CultureInfo]::InvariantCulture)
                $quantity = [decimal]0
                if (-not [decimal]::TryParse($quantityText, [Globalization.NumberStyles]::Number, [Globalization.CultureInfo]::InvariantCulture, [ref]$quantity)) {
                    throw "La consulta devolvió una cantidad no numérica; la extracción se rechaza."
                }

                $key = "$warehouse|$code|$unit"
                if (-not $groups.ContainsKey($key)) {
                    $groups[$key] = @{
                        warehouse = $warehouse
                        type = "Q"
                        code = $code
                        productDescription = $description
                        shortDescription = $shortDescription
                        unit = $unit
                        quantity = [decimal]0
                        locations = @{}
                        zones = @{}
                    }
                }
                $group = $groups[$key]
                if ($group.productDescription -ne $description) {
                    throw "Hay descripciones diferentes para el mismo almacén, código y unidad; la extracción se rechaza."
                }
                $group.quantity += $quantity
                $location = Get-TextField $recordset "WAREHOUSELOCATIONCODE"
                $zone = Get-TextField $recordset "WHSLOCATIONWAREHOUSEZONECODE"
                if ($location) { $group.locations[$location] = $true }
                if ($zone) { $group.zones[$zone] = $true }
                $recordset.MoveNext()
            }
        } finally {
            if ($recordset -and $recordset.State -ne 0) { $recordset.Close() }
            if ($recordset) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($recordset) }
            $recordset = $null
        }
        if ($rawCount -eq 0 -or $groups.Count -eq 0) {
            throw "La consulta no devolvió saldos tipo Q para QA/Q1; no se enviará una extracción vacía."
        }

        $items = @($groups.Values | Sort-Object warehouse, code, unit | ForEach-Object {
            [pscustomobject]@{
                warehouse = $_.warehouse
                type = $_.type
                code = $_.code
                productDescription = $_.productDescription
                shortDescription = $_.shortDescription
                unit = $_.unit
                quantity = $_.quantity.ToString("0.############################", [Globalization.CultureInfo]::InvariantCulture)
                locationSummary = Get-JoinedValues $_.locations
                zoneSummary = Get-JoinedValues $_.zones
            }
        })
        $stage = "transmisión HTTPS"
        $payload = @{
            extractedAt = [DateTimeOffset]::UtcNow.ToString("o")
            balanceDate = (Get-Date).ToString("yyyy-MM-dd")
            rows = $items
        }
        $json = ConvertTo-Json -InputObject $payload -Depth 8 -Compress
        Invoke-RestMethod -Method Post -Uri "$apiRoot/connector/$RequestId/preview" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $json | Out-Null
        Write-Host "Extracción enviada a la vista previa de ALMACENANDO: $($items.Count) productos consolidados ($rawCount filas Oracle)."
    } catch {
        $safeMessage = switch ($stage) {
            "conexión Oracle" { "No se pudo abrir la conexión Oracle. Revisa el DSN y la cuenta autorizada." }
            "verificación de productos" { "No se pudo validar la unicidad de los productos en NOW.PRODUCT." }
            "lectura de saldos" { $_.Exception.Message }
            default { "No se pudo transmitir la extracción por HTTPS." }
        }
        Write-Host "Extracción detenida en etapa: $stage."
        Write-Host $safeMessage
        Send-Failure -RequestId $RequestId -Message $safeMessage
    } finally {
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
}

Write-Host "Conector Datatex NOW iniciado en modo de consulta. Presiona Ctrl+C para detener."
Write-Host "No se conecta a Oracle hasta que ALMACENANDO tenga una solicitud pendiente."
try {
  while ($true) {
    try {
        $response = Invoke-RestMethod -Method Get -Uri "$apiRoot/connector/next" -Headers $headers -TimeoutSec 20
        if ($response.request -and $response.request.id) {
            Write-Host "Solicitud recibida. Ejecutando consulta de solo lectura."
            Invoke-Extraction -RequestId ([string]$response.request.id)
        }
    } catch {
        Write-Host "No se pudo consultar ALMACENANDO por HTTPS; se reintentará."
    }
    Start-Sleep -Seconds ([Math]::Max(5, $PollSeconds))
  }
} finally {
  if ($script:oracleSecurePassword) { $script:oracleSecurePassword.Dispose() }
  $script:oracleSecurePassword = $null
  $script:oracleUserName = $null
  $token = $null
  $headers = $null
}
