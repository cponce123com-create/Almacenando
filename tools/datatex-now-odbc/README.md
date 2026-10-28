# Conector ODBC de Datatex NOW para ALMACENANDO

El conector corre en la PC que tiene el DSN ODBC `PRO`. Mantiene una conexión HTTPS saliente a ALMACENANDO y consulta Oracle en modo de solo lectura únicamente cuando hay una solicitud pendiente.

## Requisitos

- Windows con el DSN `PRO` y el controlador ODBC de 32 bits configurados.
- Cuenta Oracle con permiso de lectura para las tablas NOW utilizadas.
- Variable `DATATEX_CONNECTOR_TOKEN` configurada en el servicio de Render.

## Inicio

1. Extrae el ZIP completo en una carpeta local; conserva juntos el `.cmd` y el `.ps1`.
2. Haz doble clic en `Iniciar-Conector-DatatexNOW.cmd`.
3. La primera vez ingresa el token de Render, el usuario Oracle (Enter usa `excel`) y la contraseña autorizada.
4. Deja abierta la ventana del conector. En la web solicita la sincronización desde **Saldo Actualizado** o **Maestro de Productos**.
5. Revisa la vista previa en ALMACENANDO y confirma o descártala.

El conector cifra el token y la contraseña con DPAPI en el perfil de Windows que lo configura. Solo ese usuario de Windows puede reutilizar esa configuración. Para cambiar de PC o de usuario, elimina `%LOCALAPPDATA%\Almacenando\DatatexNow\connector.json` y configura de nuevo. No envíes ese archivo ni credenciales por chat.

## Saldo Actualizado

Consulta productos de tipo `Q` en los almacenes `QA`, `Q1`, `QP`, `QL` y `QC`. El cruce con `NOW.PRODUCT` usa código y tipo, para no confundir un producto químico `Q` con otro `S` que comparte código. La consolidación mantiene filas separadas por almacén, código, unidad, ubicación y zona. También obtiene la fecha máxima de `NOW.STOCKTRANSACTION` por almacén y código `Q`, para las plantillas `DN`, `DL`, `DA`, `60` y `46`.

La confirmación añade una captura al historial de ALMACENANDO; no escribe ni modifica datos en Oracle.

## Maestro de Productos

En **Maestro de Productos**, selecciona QA, Q1, QP, QL, QC o todos los almacenes y pulsa **Actualizar desde NOW**. El conector obtiene los productos `Q` que tienen saldo en los almacenes seleccionados, reúne sus ubicaciones para la ficha de producto y envía una vista previa. Al confirmar, los campos de seguridad y stock mínimo existentes se conservan.

## Disponibilidad

En **Disponibilidad**, ajusta los periodos de consumo y movimientos y pulsa **Extraer de NOW**. El conector consulta Oracle en modo de solo lectura, replica los cálculos de la hoja de Excel para Q1 y muestra también los saldos y datos de QA/QD que alimentan el análisis. Las solicitudes internas se presentan según los estados utilizados por la macro (`INTERNALORDERLINE` estado `0` e `INTERNALDOCUMENTLINE` estados `0/1`).

La tabla permite seleccionar productos, escribir la cantidad necesaria y copiar un resumen para el correo o abrir un borrador en la aplicación de correo. La aplicación no envía el mensaje ni modifica Oracle. Para usar esta sección después de desplegar una versión nueva, sustituye el `.ps1` de la carpeta del conector por el que viene en el ZIP actualizado y vuelve a iniciar el `.cmd`.

## Diagnóstico de ODBC

`Test-DatatexNow.ps1` comprueba la arquitectura de PowerShell, el DSN, la conexión, `SELECT 1 FROM DUAL`, permisos de lectura y una muestra limitada. La muestra es solo de QA/Q1; no es un conteo total ni prueba la sincronización web.

Desde CMD, usa:

```bat
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\Downloads\Test-DatatexNow.ps1"
```

Para abrir el administrador ODBC de 32 bits:

```bat
"%WINDIR%\SysWOW64\odbcad32.exe"
```
