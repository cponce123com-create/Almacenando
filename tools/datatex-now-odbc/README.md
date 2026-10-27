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
