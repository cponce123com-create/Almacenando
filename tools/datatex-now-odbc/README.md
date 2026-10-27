# Diagnóstico ODBC local de Datatex NOW

Esta utilidad comprueba desde Windows la conexión ya configurada como DSN de usuario `PRO`. Usa Windows PowerShell 5.1 de 32 bits, ADODB y el controlador ODBC existente. No instala clientes Oracle, no abre puertos ni se conecta con Render.

## Qué comprueba

1. Que el proceso PowerShell sea de 32 bits y detecta la arquitectura de Windows.
2. Que exista el DSN de usuario solicitado y cuál es el nombre registrado del controlador.
3. Que se pueda abrir una conexión con credenciales Oracle autorizadas.
4. Que responda `SELECT 1 AS TEST_VALUE FROM DUAL`.
5. Que la cuenta tenga acceso de lectura a las tablas y columnas de referencia mediante una consulta que devuelve cero filas.
6. Que una consulta de solo lectura, limitada a un máximo de 50 filas, pueda leer saldos tipo `Q` en QA/Q1.

La muestra informa la cantidad de filas recibidas dentro del límite y hasta cinco códigos enmascarados. No imprime descripciones ni cantidades y no guarda resultados. La muestra limitada no es un conteo total ni permite concluir que un saldo sea cero.

## Requisitos

- Windows con el DSN `PRO` y el controlador ODBC de 32 bits configurados por el área de sistemas.
- Cuenta Oracle autorizada con permisos de solo lectura para `NOW.BALANCE`, `NOW.PRODUCT` y las columnas consultadas.
- No uses credenciales administrativas ni contraseñas de la macro. Solicita una cuenta autorizada si la actual no está aprobada para esta prueba.

## Ejecución

Descarga `Test-DatatexNow.ps1` en una carpeta local aprobada por la empresa. Abre CMD y ejecuta:

```bat
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "C:\ruta\aprobada\Test-DatatexNow.ps1"
```

El script pedirá el usuario y luego la contraseña en modo oculto. No escribas la contraseña como argumento del comando, en un archivo, ni en un chat. La contraseña se usa solo en memoria para abrir la conexión y no se imprime.

Para cambiar el DSN o el límite de la muestra:

```bat
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "C:\ruta\aprobada\Test-DatatexNow.ps1" -Dsn PRO -SampleLimit 10
```

Si el DSN no aparece, abre el administrador ODBC de 32 bits con:

```bat
"%WINDIR%\SysWOW64\odbcad32.exe"
```

Confirma en la pestaña **DSN de usuario** que exista `PRO` y consulta con sistemas cuál es el controlador correcto. No crees ni cambies DSN corporativos sin autorización.

## Interpretación

- `RESULTADO: diagnóstico ODBC completado`: las comprobaciones incluidas pasaron en esa computadora y con esa cuenta.
- `Compatibilidad ODBC ERROR`: se ejecutó PowerShell de 64 bits; usa la ruta `SysWOW64` indicada arriba.
- `DSN ... NO`: el DSN no está registrado como DSN de usuario visible para el proceso de 32 bits.
- `Conexión ODBC ERROR`: revisa con sistemas la conectividad de red, el DSN y la cuenta autorizada. No compartas la contraseña.
- `Lectura ... ERROR`: la cuenta puede conectarse, pero no tiene acceso a algún objeto/columna referenciado, o los nombres reales difieren; valida el esquema con el administrador de NOW.
- `Muestra ... 0 fila(s)`: la consulta terminó, pero puede que no haya filas que cumplan los filtros o que los nombres/valores de almacén y tipo deban confirmarse con sistemas.

No envíes a soporte una captura que muestre códigos reales de producto. Comparte el estado de cada comprobación y redacta cualquier dato operativo.

## Límites de esta fase

Esta herramienta no modifica Oracle ni ALMACENANDO, no transmite saldos, no calcula consolidaciones y no prueba el esquema de sincronización web. La consulta de muestra conserva los campos y filtros confirmados en la macro de referencia; la semántica exacta de cantidad/unidad y la cardinalidad del JOIN deberán validarse antes de calcular sumas. No se afirma una conexión real hasta que se ejecute en la PC autorizada.

La integración con el backend y el módulo de Saldos queda para una fase posterior, una vez validada esta conexión y confirmada la autorización de transmitir datos operativos a la infraestructura de ALMACENANDO.


## Sincronización desde la pantalla de Saldos

La conexión ya fue comprobada desde la PC. Para usar **Solicitar actualización** en ALMACENANDO, el conector local debe estar ejecutándose; este mantiene una conexión saliente HTTPS y consulta Oracle solo cuando la web crea una solicitud. No abre puertos entrantes ni necesita Excel.

### Configuración pendiente en Render

1. Tras revisar y aprobar el PR, configura una credencial aleatoria exclusiva en la variable secreta `DATATEX_CONNECTOR_TOKEN` del servicio de Render.
2. No reutilices la contraseña de Oracle como token. Guarda el token en el gestor aprobado por la empresa.
3. Antes de transmitir saldos hacia Render, confirma que la empresa autoriza ese flujo de datos.

### Inicio del conector en Windows

Abre CMD y ejecuta PowerShell de 32 bits. Reemplaza la ruta si guardaste el archivo en otra carpeta:

```bat
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$env:ALMACENANDO_API_URL='https://almacenando.onrender.com/api/balances/now'; & '%USERPROFILE%\Downloads\Run-DatatexConnector.ps1'"
```

El programa solicita el token del conector y las credenciales Oracle autorizadas al iniciar. Las mantiene en memoria durante esa sesión y no las escribe en archivos ni logs. Deja la ventana abierta. El conector consulta la cola cada 10 segundos y solo abre Oracle cuando hay una solicitud pendiente.

En la web, entra a **Saldo Actualizado → Sincronización Datatex NOW → Solicitar actualización**. Cuando llegue la vista previa, revisa los productos y confirma o descarta. La confirmación crea una nueva captura histórica; no reemplaza saldos anteriores. Los registros manuales se identifican como EXCEL y los de esta integración como NOW.

Si el conector no se ha visto en los últimos 90 segundos, el botón permanece deshabilitado. Si la consulta encuentra códigos repetidos en NOW.PRODUCT, filas incompletas, cantidades nulas o datos fuera de los límites, la extracción se detiene y no guarda una vista previa parcial.

### Alcance y validación

El conector consulta solo QA/Q1 y tipo Q. Consolida por almacén, código completo y unidad, y conserva el resumen de ubicaciones y zonas. Antes de una primera importación real, compara la vista previa con el saldo producido por la macro para confirmar que `BASEPRIMARYQUANTITYUNIT` corresponde a la cantidad que ALMACENANDO debe almacenar.

Esta rama agrega una migración PostgreSQL, rutas protegidas, controles de vista previa y la interfaz. La migración se aplica automáticamente por el comando de despliegue de Render al integrar el cambio; por eso no se debe desplegar ni configurar el token de producción hasta que el PR y la autorización de transmisión sean revisados.
