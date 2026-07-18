# Servicio de impresion BackendBrisas

Este servicio corre en la PC principal de impresion en Windows y consume la cola desde la API.

## Requisitos

- Node.js 18 o superior
- Las impresoras Epson instaladas en Windows con el nombre exacto de `nombre_sistema`
- Un usuario del sistema con acceso a la API y rol `ADMIN`, `MESERO` o `CAJERO`

## Variables de entorno

- `PRINT_API_BASE_URL`: URL base de la API. Ejemplo: `http://localhost:3000/api`
- `PRINT_API_TOKEN`: token Bearer ya generado. Opcional si usas usuario/password.
- `PRINT_API_USERNAME`: usuario para login automático
- `PRINT_API_PASSWORD`: password para login automático
- `PRINT_POLL_INTERVAL_MS`: intervalo de sondeo en milisegundos. Default: `1000`
- `PRINT_FILTER_TYPE`: `COCINA` o `FACTURA` para dejar una instancia dedicada por impresora. Opcional.
- `PRINT_PRINTER_ID`: filtra por una impresora específica. Opcional.
- `PRINT_TEMP_DIR`: carpeta temporal para crear archivos antes de imprimir. Opcional.

## Ejemplos

Una instancia para cocina:

```powershell
$env:PRINT_API_BASE_URL = "http://localhost:3000/api"
$env:PRINT_API_USERNAME = "caja"
$env:PRINT_API_PASSWORD = "123456"
$env:PRINT_FILTER_TYPE = "COCINA"
node scripts/print-service.js
```

Una instancia para facturacion:

```powershell
$env:PRINT_API_BASE_URL = "http://localhost:3000/api"
$env:PRINT_API_USERNAME = "caja"
$env:PRINT_API_PASSWORD = "123456"
$env:PRINT_FILTER_TYPE = "FACTURA"
node scripts/print-service.js
```

## Como funciona

1. Hace login si no tiene token.
2. Consulta `POST /api/impresion/cola/next`.
3. Si recibe un trabajo, lo marca como `IMPRIMIENDO` desde el backend.
4. Imprime el contenido usando `Out-Printer` de PowerShell al nombre de impresora recibido en `impresoraSistema`.
5. Marca el resultado como `IMPRESO` o `ERROR`.

## Recomendacion de despliegue

- Ejecuta una instancia para `COCINA` y otra para `FACTURA`.
- Configura cada impresora en Windows exactamente con el valor de `nombre_sistema` almacenado en la tabla `impresoras`.
- Si luego quieres mayor compatibilidad ESC/POS, el siguiente paso seria migrar este servicio a una libreria especializada de impresion termica.
