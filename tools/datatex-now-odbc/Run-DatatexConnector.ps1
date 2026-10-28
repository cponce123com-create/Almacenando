# Local Datatex NOW connector. Read-only Oracle queries; outbound HTTPS only.
[CmdletBinding()]
param(
    [string]$Dsn = "PRO",
    [int]$PollSeconds = 10,
    [int]$MaxRawRows = 5000
)

$ErrorActionPreference = "Stop"
$apiRoot = "https://almacenando.onrender.com/api/balances/now"
$token = $null
$script:oracleUserName = $null
$script:oracleSecurePassword = $null
$configDirectory = Join-Path $env:LOCALAPPDATA "Almacenando\DatatexNow"
$configPath = Join-Path $configDirectory "connector.json"

if ([IntPtr]::Size -ne 4) {
    throw "Ejecuta este conector con Windows PowerShell de 32 bits (SysWOW64)."
}

if (Test-Path $configPath) {
    $savedConfig = Get-Content -Path $configPath -Raw | ConvertFrom-Json
    $tokenSecure = ConvertTo-SecureString $savedConfig.tokenProtected
    $script:oracleSecurePassword = ConvertTo-SecureString $savedConfig.oraclePasswordProtected
    $script:oracleUserName = [string]$savedConfig.oracleUserName
} else {
    Write-Host "Configuración inicial (solo la primera vez)."
    Write-Host "Usará el DSN PRO de NOW; después no volverá a pedir estos datos."
    $tokenSecure = Read-Host "Token configurado una sola vez en Render" -AsSecureString
    $oracleUserInput = Read-Host "Usuario Oracle [excel] (Enter para usar excel)"
    $script:oracleUserName = if ([string]::IsNullOrWhiteSpace($oracleUserInput)) { "excel" } else { $oracleUserInput.Trim() }
    $script:oracleSecurePassword = Read-Host "Contraseña Oracle (la de la macro)" -AsSecureString
    if ($tokenSecure.Length -eq 0 -or [string]::IsNullOrWhiteSpace($script:oracleUserName) -or $script:oracleSecurePassword.Length -eq 0) {
        throw "La configuración inicial está incompleta."
    }
    New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
    $savedConfig = @{
        tokenProtected = ConvertFrom-SecureString $tokenSecure
        oracleUserName = $script:oracleUserName
        oraclePasswordProtected = ConvertFrom-SecureString $script:oracleSecurePassword
    }
    $savedConfig | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8
}

$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer) }
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $tokenSecure.Dispose()
}

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
    $consumptionRecordset = $null
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
        $stage = "lectura del último consumo"
        $lastConsumptionByKey = @{}
        $consumptionSql = @"
SELECT
    LOGICALWAREHOUSECODE,
    DECOSUBCODE01 AS BALANCE_SUBCODE01,
    DECOSUBCODE02 AS BALANCE_SUBCODE02,
    MAX(TRANSACTIONDATE) AS LASTCONSUMPTION
FROM NOW.STOCKTRANSACTION
WHERE ITEMTYPECODE = 'Q'
  AND LOGICALWAREHOUSECODE IN ('QA','Q1','QP','QL','QC')
  AND TEMPLATECODE IN ('DN','DL','DA','60','46')
GROUP BY LOGICALWAREHOUSECODE, DECOSUBCODE01, DECOSUBCODE02
"@
        $consumptionRecordset = $connection.Execute($consumptionSql)
        try {
            while (-not $consumptionRecordset.EOF) {
                $consumptionWarehouse = Get-TextField $consumptionRecordset "LOGICALWAREHOUSECODE"
                $consumptionCode01 = Get-TextField $consumptionRecordset "BALANCE_SUBCODE01"
                $consumptionCode02 = Get-TextField $consumptionRecordset "BALANCE_SUBCODE02"
                $consumptionValue = Get-Field $consumptionRecordset "LASTCONSUMPTION"
                if ($consumptionValue -and $consumptionValue -isnot [DBNull]) {
                    $consumptionDate = [Convert]::ToDateTime($consumptionValue, [Globalization.CultureInfo]::InvariantCulture)
                    $consumptionKey = "$consumptionWarehouse|$consumptionCode01-$consumptionCode02"
                    $lastConsumptionByKey[$consumptionKey] = $consumptionDate.ToString("yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
                }
                $consumptionRecordset.MoveNext()
            }
        } finally {
            if ($consumptionRecordset -and $consumptionRecordset.State -ne 0) { $consumptionRecordset.Close() }
            if ($consumptionRecordset) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($consumptionRecordset) }
            $consumptionRecordset = $null
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
FROM NOW.BALANCE H
JOIN (
    SELECT
        SUBCODE01,
        SUBCODE02,
        ITEMTYPECODE,
        MIN(LONGDESCRIPTION) AS LONGDESCRIPTION,
        MIN(SHORTDESCRIPTION) AS SHORTDESCRIPTION
    FROM NOW.PRODUCT
    GROUP BY SUBCODE01, SUBCODE02, ITEMTYPECODE
) F
  ON F.SUBCODE01 = H.DECOSUBCODE01
 AND F.SUBCODE02 = H.DECOSUBCODE02
 AND F.ITEMTYPECODE = H.ITEMTYPECODE
WHERE H.LOGICALWAREHOUSECODE IN ('QA','Q1','QP','QL','QC')
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
                $consumptionKey = "$warehouse|$code"
                $lastConsumption = if ($lastConsumptionByKey.ContainsKey($consumptionKey)) { $lastConsumptionByKey[$consumptionKey] } else { $null }
                $unit = Get-TextField $recordset "BASEPRIMARYUNITCODE"
                $location = Get-TextField $recordset "WAREHOUSELOCATIONCODE"
                $zone = Get-TextField $recordset "WHSLOCATIONWAREHOUSEZONECODE"
                $description = Get-TextField $recordset "LONGDESCRIPTION"
                $shortDescription = Get-TextField $recordset "SHORTDESCRIPTION"
                $quantityValue = Get-Field $recordset "BALANCE_QUANTITY"
                if ($warehouse -notin @("QA", "Q1", "QP", "QL", "QC") -or $code01 -eq "" -or $code02 -eq "" -or $description -eq "" -or $unit -eq "") {
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

                $key = "$warehouse|$code|$unit|$location|$zone"
                if (-not $groups.ContainsKey($key)) {
                    $groups[$key] = @{
                        warehouse = $warehouse
                        type = "Q"
                        code = $code
                        productDescription = $description
                        shortDescription = $shortDescription
                        unit = $unit
                        location = $location
                        zone = $zone
                        ultimoConsumo = $lastConsumption
                        quantity = [decimal]0
                    }
                }
                $group = $groups[$key]
                $group.quantity += $quantity
                $recordset.MoveNext()
            }
        } finally {
            if ($recordset -and $recordset.State -ne 0) { $recordset.Close() }
            if ($recordset) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($recordset) }
            $recordset = $null
        }
        if ($rawCount -eq 0 -or $groups.Count -eq 0) {
            throw "La consulta no devolvió saldos tipo Q para QA, Q1, QP, QL o QC; no se enviará una extracción vacía."
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
                locationSummary = $_.location
                zoneSummary = $_.zone
                ultimoConsumo = $_.ultimoConsumo
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
        $caughtError = $_
        $safeMessage = switch ($stage) {
            "conexión Oracle" { "No se pudo abrir la conexión Oracle. Revisa el DSN y la cuenta autorizada." }
            "verificación de productos" {
                $detailParts = @()
                try {
                    if ($connection -and $connection.Errors.Count -gt 0) {
                        foreach ($adoError in $connection.Errors) {
                            $description = [string]$adoError.Description
                            if (-not [string]::IsNullOrWhiteSpace($description)) {
                                $detailParts += "ADO Number=$($adoError.Number); SQLState=$($adoError.SQLState); NativeError=$($adoError.NativeError); $description"
                            }
                        }
                    }
                } catch {}
                $exceptionText = [string]$caughtError.Exception.Message
                if (-not [string]::IsNullOrWhiteSpace($exceptionText)) { $detailParts += $exceptionText }
                if ($detailParts.Count -eq 0) {
                    $fallback = [string]$caughtError.ToString()
                    if ([string]::IsNullOrWhiteSpace($fallback)) { $fallback = "PowerShell error id: $($caughtError.FullyQualifiedErrorId); HRESULT: $($caughtError.Exception.HResult)" }
                    $detailParts += $fallback
                }
                Write-Host "Detalle técnico local (no se envía a ALMACENANDO): $($detailParts -join ' | ')"
                "Falló la validación de productos en la base Oracle."
            }
            "lectura del último consumo" { $caughtError.Exception.Message }
            "lectura de saldos" { $caughtError.Exception.Message }
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
        if ($consumptionRecordset) {
            try { if ($consumptionRecordset.State -ne 0) { $consumptionRecordset.Close() } } catch {}
            try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($consumptionRecordset) } catch {}
        }
        if ($connection) {
            try { if ($connection.State -ne 0) { $connection.Close() } } catch {}
            try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($connection) } catch {}
        }
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

function Invoke-ProductExtraction {
    param([string]$RequestId, [string]$Warehouse)
    $connection = $null
    $recordset = $null
    $password = $null
    $stage = "conexión Oracle"
    try {
        if ($Warehouse -notin @("QA", "Q1", "QP", "QL", "QC", "all")) { throw "Almacén no permitido para la maestra." }
        $warehouseClause = if ($Warehouse -eq "all") { "IN ('QA','Q1','QP','QL','QC')" } else { "= '$Warehouse'" }
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
        $stage = "lectura del maestro"
        $sql = @"
SELECT
    F.SUBCODE01,
    F.SUBCODE02,
    F.LONGDESCRIPTION,
    F.SHORTDESCRIPTION,
    H.LOGICALWAREHOUSECODE,
    H.BASEPRIMARYUNITCODE,
    H.WAREHOUSELOCATIONCODE,
    H.WHSLOCATIONWAREHOUSEZONECODE
FROM (
    SELECT SUBCODE01, SUBCODE02,
           MIN(LONGDESCRIPTION) AS LONGDESCRIPTION,
           MIN(SHORTDESCRIPTION) AS SHORTDESCRIPTION
    FROM NOW.PRODUCT
    WHERE ITEMTYPECODE = 'Q'
    GROUP BY SUBCODE01, SUBCODE02
) F
JOIN NOW.BALANCE H
  ON H.DECOSUBCODE01 = F.SUBCODE01
 AND H.DECOSUBCODE02 = F.SUBCODE02
 AND H.ITEMTYPECODE = 'Q'
WHERE H.LOGICALWAREHOUSECODE $warehouseClause
ORDER BY F.SUBCODE01, F.SUBCODE02
"@
        $recordset = $connection.Execute($sql)
        $products = @{}
        $rawCount = 0
        try {
            while (-not $recordset.EOF) {
                $rawCount++
                if ($rawCount -gt $MaxRawRows) { throw "La maestra excede el límite de $MaxRawRows filas Oracle." }
                $code01 = Get-TextField $recordset "SUBCODE01"
                $code02 = Get-TextField $recordset "SUBCODE02"
                $code = "$code01-$code02"
                $name = Get-TextField $recordset "LONGDESCRIPTION"
                $unit = Get-TextField $recordset "BASEPRIMARYUNITCODE"
                $rowWarehouse = Get-TextField $recordset "LOGICALWAREHOUSECODE"
                if ($rowWarehouse -notin @("QA", "Q1", "QP", "QL", "QC") -or $code01 -eq "" -or $code02 -eq "" -or $name -eq "" -or $unit -eq "") {
                    throw "NOW.PRODUCT devolvió un químico Q sin código, descripción o unidad."
                }
                $key = "$rowWarehouse|$code"
                if (-not $products.ContainsKey($key)) {
                    $products[$key] = @{
                        warehouse = $rowWarehouse
                        type = "Q"
                        code = $code
                        name = $name
                        unit = $unit
                        locations = @{}
                    }
                }
                $product = $products[$key]
                if ($product.unit -ne $unit) { throw "El código $code tiene más de una unidad en el almacén $Warehouse." }
                $location = Get-TextField $recordset "WAREHOUSELOCATIONCODE"
                $zone = Get-TextField $recordset "WHSLOCATIONWAREHOUSEZONECODE"
                $locationText = (@($zone, $location) | Where-Object { $_ }) -join "/"
                if ($locationText) { $product.locations[$locationText] = $true }
                $recordset.MoveNext()
            }
        } finally {
            if ($recordset -and $recordset.State -ne 0) { $recordset.Close() }
            if ($recordset) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($recordset) }
            $recordset = $null
        }
        if ($rawCount -eq 0 -or $products.Count -eq 0) { throw "No se encontraron productos tipo Q con saldo en $Warehouse." }
        $rows = @($products.Values | Sort-Object code | ForEach-Object {
            [pscustomobject]@{
                warehouse = $_.warehouse
                type = $_.type
                code = $_.code
                name = $_.name
                unit = $_.unit
                location = Get-JoinedValues $_.locations
            }
        })
        $payload = @{ extractedAt = [DateTimeOffset]::UtcNow.ToString("o"); rows = $rows }
        $json = ConvertTo-Json -InputObject $payload -Depth 6 -Compress
        Invoke-RestMethod -Method Post -Uri "$apiRoot/products/$RequestId/preview" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $json | Out-Null
        Write-Host "Vista previa de Maestro de Productos enviada: $($rows.Count) químicos Q en $Warehouse."
    } catch {
        $message = $_.Exception.Message
        Write-Host "Importación de maestro detenida en etapa: $stage."
        Write-Host $message
        Send-Failure -RequestId $RequestId -Message $message
    } finally {
        $password = $null
        if ($recordset) { try { if ($recordset.State -ne 0) { $recordset.Close() } } catch {}; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($recordset) } catch {} }
        if ($connection) { try { if ($connection.State -ne 0) { $connection.Close() } } catch {}; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($connection) } catch {} }
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
            if ($response.request.kind -eq "products") {
                Invoke-ProductExtraction -RequestId ([string]$response.request.id) -Warehouse ([string]$response.request.warehouse)
            } else {
                Invoke-Extraction -RequestId ([string]$response.request.id)
            }
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
