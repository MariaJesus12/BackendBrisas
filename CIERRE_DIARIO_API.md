# Cierre diario de ventas

## Endpoint

`GET /api/pedidos/cierre-diario?fecha=YYYY-MM-DD`

Requiere `Authorization: Bearer <token>` y pueden usarlo los roles `ADMIN`,
`MESERO` y `CAJERO`. Si se omite `fecha`, usa el día actual de Costa Rica.

El cierre suma los pagos creados durante la fecha solicitada, únicamente cuando
pertenecen a pedidos con estado `FACTURADO` o `CERRADO`. Esto excluye pedidos
cancelados, borradores, pedidos pendientes y evita contar el vuelto como venta.

`totalVendido` y cada `porMetodoPago[].total` están expresados en la moneda
local del sistema (`pagos.monto`), por lo que los pagos en otra moneda ya usan
el tipo de cambio registrado al crear el pago.

## Ejemplo de respuesta

```json
{
  "fecha": "2026-08-16",
  "periodo": {
    "desde": "2026-08-16 00:00:00",
    "hasta": "2026-08-16 23:59:59",
    "zonaHoraria": "America/Costa_Rica"
  },
  "resumen": {
    "totalVendido": 85000,
    "pagosCount": 24,
    "pedidosCount": 18
  },
  "porMetodoPago": [
    {
      "metodoPagoId": 1,
      "metodoPagoNombre": "Efectivo",
      "total": 50000,
      "pagosCount": 15,
      "pedidosCount": 13
    }
  ]
}
```

Se incluye también cada método de pago configurado que no tenga movimientos,
con total y contadores en cero. La pantalla de pedidos puede mostrar el total
general con `resumen.totalVendido` y una fila por cada elemento de
`porMetodoPago`.
