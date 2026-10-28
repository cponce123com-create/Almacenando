# Local Datatex NOW connector. Read-only Oracle queries; outbound HTTPS only.
[CmdletBinding()]
param(
    [string]$Dsn = "PRO",
    [int]$PollSeconds = 10,
    [int]$MaxRawRows = 5000
)

$ErrorActionPreference = "Stop"
$apiRoot = "https://almacenando.onrender.com/api/balances/now"
$availabilityApiRoot = "https://almacenando.onrender.com/api/availability"
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
function Format-AvailabilityNumber {
    param([decimal]$Value)
    return $Value.ToString("0.############################", [Globalization.CultureInfo]::InvariantCulture)
}
function Get-AvailabilityValue {
    param([hashtable]$Map, [string]$Key)
    if ($Map.ContainsKey($Key)) { return [decimal]$Map[$Key] }
    return [decimal]0
}
function Invoke-AvailabilityExtraction {
    param([string]$RequestId, [object]$Config)
    $connection = $null
    $recordsets = New-Object System.Collections.Generic.List[object]
    $password = $null
    try {
        foreach ($name in @("consumptionStart", "consumptionEnd", "q1MovementsStart", "q1MovementsEnd", "qpMovementsStart", "qpMovementsEnd")) {
            if ([string]$Config.$name -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "El rango de fechas de disponibilidad es inválido." }
        }
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($script:oracleSecurePassword)
        try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
        $connection = New-Object -ComObject ADODB.Connection
        $connection.ConnectionTimeout = 15
        $connection.CommandTimeout = 120
        $connection.Open("DSN=$Dsn;UID=$script:oracleUserName;PWD=$password")
        $password = $null

        $toOracleDate = { param([string]$date) ([datetime]::ParseExact($date, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)).ToString("dd/MM/yyyy", [Globalization.CultureInfo]::InvariantCulture) }
        $consStart = & $toOracleDate ([string]$Config.consumptionStart)
        $consEnd = & $toOracleDate ([string]$Config.consumptionEnd)
        $q1Start = & $toOracleDate ([string]$Config.q1MovementsStart)
        $q1End = & $toOracleDate ([string]$Config.q1MovementsEnd)
        $qpStart = & $toOracleDate ([string]$Config.qpMovementsStart)
        $qpEnd = & $toOracleDate ([string]$Config.qpMovementsEnd)

        $productsSql = @"
SELECT H.SUBCODE01, H.SUBCODE02, MIN(H.LONGDESCRIPTION) AS LONGDESCRIPTION,
       MIN(H.REPLENCODE) AS REPLENCODE, MIN(K.BASEPRIMARYUNITCODE) AS UNITCODE
FROM NOW.PRODUCT H
JOIN NOW.BALANCE K ON K.DECOSUBCODE01=H.SUBCODE01 AND K.DECOSUBCODE02=H.SUBCODE02 AND K.ITEMTYPECODE='Q'
WHERE H.ITEMTYPECODE='Q' AND K.LOGICALWAREHOUSECODE IN ('QA','Q1','QD','QP')
  AND K.BASEPRIMARYQUANTITYUNIT >= 0.001
GROUP BY H.SUBCODE01, H.SUBCODE02
ORDER BY MIN(H.LONGDESCRIPTION)
"@
        $productsRs = $connection.Execute($productsSql); $recordsets.Add($productsRs)
        $products = New-Object System.Collections.Generic.List[object]
        $seenProducts = @{}
        while (-not $productsRs.EOF) {
            $code = "$(Get-TextField $productsRs 'SUBCODE01')-$(Get-TextField $productsRs 'SUBCODE02')"
            if (-not $seenProducts.ContainsKey($code)) {
                $seenProducts[$code] = $true
                $replenCode = Get-TextField $productsRs "REPLENCODE"
                $lineStatus = "No Linea"
                if ($replenCode -eq "201") { $lineStatus = "Linea" }
                $products.Add([pscustomobject]@{
                    code = $code; description = Get-TextField $productsRs "LONGDESCRIPTION"
                    lineStatus = $lineStatus
                    unit = Get-TextField $productsRs "UNITCODE"
                })
            }
            $productsRs.MoveNext()
        }
        if ($products.Count -eq 0) { throw "NOW no devolvió productos Q con saldo en QA, Q1, QD o QP." }

        $maps = @{}
        $queries = @{
            balances = @"
SELECT LOGICALWAREHOUSECODE || '|' || DECOSUBCODE01 || '-' || DECOSUBCODE02 AS ITEMKEY,
       SUM(BASEPRIMARYQUANTITYUNIT) AS TOTAL
FROM NOW.BALANCE WHERE ITEMTYPECODE='Q' AND LOGICALWAREHOUSECODE IN ('QA','Q1','QD')
GROUP BY LOGICALWAREHOUSECODE, DECOSUBCODE01, DECOSUBCODE02
"@
            documents = @"
SELECT SUBCODE01 || '-' || SUBCODE02 AS ITEMKEY, SUM(BASEPRIMARYQUANTITY) AS TOTAL
FROM NOW.INTERNALDOCUMENTLINE WHERE PROGRESSSTATUS IN ('0','1') AND ITEMTYPEAFICODE='Q'
AND WAREHOUSECODE IN ('QA','Q1') GROUP BY SUBCODE01, SUBCODE02
"@
            orders = @"
SELECT SUBCODE01 || '-' || SUBCODE02 AS ITEMKEY, SUM(USERPRIMARYQUANTITY) AS TOTAL
FROM NOW.INTERNALORDERLINE WHERE ITEMTYPEAFICODE='Q' AND DOCUMENTTYPETYPE='03'
AND WAREHOUSECODE IN ('QA','Q1') AND PROGRESSSTATUS='0' GROUP BY SUBCODE01, SUBCODE02
"@
            reservations = @"
SELECT WAREHOUSECODE || '|' || SUBCODE01 || '-' || SUBCODE02 AS ITEMKEY, SUM(BASEPRIMARYQUANTITY) AS TOTAL
FROM NOW.PRODUCTIONORDERRESERVATION WHERE ITEMTYPEAFICODE='Q' AND BASEPRIMARYUOMCODE NOT IN ('L')
AND ORDERCOUNTERCODE IN ('ORDPRO','ORDPROR') AND PROGRESSSTATUS='0' AND WAREHOUSECODE IN ('Q1','QD')
GROUP BY WAREHOUSECODE, SUBCODE01, SUBCODE02
"@
            consumption = @"
SELECT DECOSUBCODE01 || '-' || DECOSUBCODE02 AS ITEMKEY, SUM(BASEPRIMARYQUANTITY) AS TOTAL
FROM NOW.STOCKTRANSACTION WHERE ITEMTYPECODE='Q' AND LOGICALWAREHOUSECODE='Q1'
AND TEMPLATECODE IN ('DN','DA','DL','46','60')
AND TRANSACTIONDATE >= TO_DATE('$consStart','DD/MM/YYYY') AND TRANSACTIONDATE <= TO_DATE('$consEnd','DD/MM/YYYY')
GROUP BY DECOSUBCODE01, DECOSUBCODE02
"@
            qpMovements = @"
SELECT DECOSUBCODE01 || '-' || DECOSUBCODE02 AS ITEMKEY, SUM(BASEPRIMARYQUANTITY) AS TOTAL
FROM NOW.STOCKTRANSACTION WHERE ITEMTYPECODE='Q' AND LOGICALWAREHOUSECODE='QP' AND TEMPLATECODE='10'
AND TRANSACTIONDATE >= TO_DATE('$qpStart','DD/MM/YYYY') AND TRANSACTIONDATE <= TO_DATE('$qpEnd','DD/MM/YYYY')
GROUP BY DECOSUBCODE01, DECOSUBCODE02
"@
            q1Movements = @"
SELECT DECOSUBCODE01 || '-' || DECOSUBCODE02 AS ITEMKEY, SUM(BASEPRIMARYQUANTITY) AS TOTAL
FROM NOW.STOCKTRANSACTION WHERE ITEMTYPECODE='Q' AND LOGICALWAREHOUSECODE='Q1'
AND TEMPLATECODE IN ('DN','DA','DL','46')
AND TRANSACTIONDATE >= TO_DATE('$q1Start','DD/MM/YYYY') AND TRANSACTIONDATE <= TO_DATE('$q1End','DD/MM/YYYY')
GROUP BY DECOSUBCODE01, DECOSUBCODE02
"@
            qaLots = @"
SELECT B.DECOSUBCODE01 || '-' || B.DECOSUBCODE02 AS ITEMKEY, B.LOTCODE, B.BASEPRIMARYQUANTITYUNIT AS QUANTITY,
       B.WHSLOCATIONWAREHOUSEZONECODE AS ZONECODE, B.WAREHOUSELOCATIONCODE AS LOCATIONCODE
FROM NOW.BALANCE B JOIN NOW.LOT A ON B.LOTCODE=A.CODE
WHERE B.ITEMTYPECODE='Q' AND B.LOGICALWAREHOUSECODE='QA'
ORDER BY A.LOTCREATIONDATE ASC
"@
        }
        foreach ($mapName in @("balances", "documents", "orders", "reservations", "consumption", "qpMovements", "q1Movements", "qaLots")) {
            $rs = $connection.Execute($queries[$mapName]); $recordsets.Add($rs)
            $maps[$mapName] = @{}
            while (-not $rs.EOF) {
                $key = Get-TextField $rs "ITEMKEY"
                if ($mapName -eq "qaLots") {
                    if ($key -and -not $maps[$mapName].ContainsKey($key)) {
                        $maps[$mapName][$key] = [pscustomobject]@{
                            lot = Get-TextField $rs "LOTCODE"; quantity = Get-TextField $rs "QUANTITY"
                            zone = Get-TextField $rs "ZONECODE"; location = Get-TextField $rs "LOCATIONCODE"
                        }
                    }
                } elseif ($key) {
                    $value = Get-Field $rs "TOTAL"
                    if ($null -ne $value -and $value -isnot [DBNull]) {
                        $maps[$mapName][$key] = [Convert]::ToDecimal($value, [Globalization.CultureInfo]::InvariantCulture)
                    }
                }
                $rs.MoveNext()
            }
        }

        $days = ([datetime]::ParseExact([string]$Config.consumptionEnd, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture) -
            [datetime]::ParseExact([string]$Config.consumptionStart, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)).Days + 1
        if ($days -lt 1) { throw "El rango de consumo debe incluir al menos un día." }
        $rows = @($products | ForEach-Object {
            $code = $_.code
            $q1Balance = Get-AvailabilityValue $maps.balances "Q1|$code"
            $qdBalance = Get-AvailabilityValue $maps.balances "QD|$code"
            $production = Get-AvailabilityValue $maps.reservations "Q1|$code"
            $qdPreparation = Get-AvailabilityValue $maps.reservations "QD|$code"
            $orders = Get-AvailabilityValue $maps.orders $code
            $documents = Get-AvailabilityValue $maps.documents $code
            $consumption = (Get-AvailabilityValue $maps.consumption $code) / $days * 2
            $qpMovements = Get-AvailabilityValue $maps.qpMovements $code
            $q1Movements = Get-AvailabilityValue $maps.q1Movements $code
            $availability = $q1Balance - $production - $orders - $documents - $consumption - $qpMovements - $q1Movements
            $qa = $maps.qaLots[$code]
            $qaLot = ""; $qaQuantity = ""; $qaZone = ""; $qaLocation = ""
            if ($qa) { $qaLot = $qa.lot; $qaQuantity = $qa.quantity; $qaZone = $qa.zone; $qaLocation = $qa.location }
            $qaBalance = Get-AvailabilityValue $maps.balances "QA|$code"
            [pscustomobject]@{
                code = $code; description = $_.description; lineStatus = $_.lineStatus; unit = $_.unit
                productionReservations = Format-AvailabilityNumber $production
                internalOrders = Format-AvailabilityNumber $orders
                internalDocuments = Format-AvailabilityNumber $documents
                consumptionTwoDays = Format-AvailabilityNumber $consumption
                qpMovements = Format-AvailabilityNumber $qpMovements
                q1Movements = Format-AvailabilityNumber $q1Movements
                q1Balance = Format-AvailabilityNumber $q1Balance
                availability = Format-AvailabilityNumber $availability
                qaLot = $qaLot
                qaBalance = Format-AvailabilityNumber $qaBalance
                qaQuantity = $qaQuantity
                qaZone = $qaZone
                qaLocation = $qaLocation
                qdBalance = Format-AvailabilityNumber $qdBalance
                qdPreparation = Format-AvailabilityNumber $qdPreparation
            }
        })
        $body = @{ extractedAt = [DateTimeOffset]::UtcNow.ToString("o"); config = $Config; rows = $rows } | ConvertTo-Json -Depth 8 -Compress
        Invoke-RestMethod -Method Post -Uri "$availabilityApiRoot/connector/$RequestId/result" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 120 | Out-Null
        Write-Host "Disponibilidad Q1 extraída: $($rows.Count) productos."
    } catch {
        $message = $_.Exception.Message
        Write-Host "No se pudo extraer la disponibilidad: $message"
        Send-Failure -RequestId $RequestId -Message $message
    } finally {
        $password = $null
        foreach ($rs in $recordsets) { try { if ($rs.State -ne 0) { $rs.Close() } } catch {}; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($rs) } catch {} }
        if ($connection) { try { if ($connection.State -ne 0) { $connection.Close() } } catch {}; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($connection) } catch {} }
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
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
            if ($response.request.kind -eq "availability") {
                Invoke-AvailabilityExtraction -RequestId ([string]$response.request.id) -Config $response.request.config
            } elseif ($response.request.kind -eq "products") {
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
