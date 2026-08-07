# API de Estadisticas

## Acceso

- Base: `/api/estadisticas`
- Requiere `Authorization: Bearer <token>`
- Rol permitido: `ADMIN`

## Endpoint principal

### GET /api/estadisticas/productos/ventas

Sirve para:
- producto mas vendido
- producto menos vendido
- ranking completo
- series para graficas
- filtros por mes, fecha especifica o rango

## Filtros soportados

### 1) Por mes

`GET /api/estadisticas/productos/ventas?month=2026-08`

Formato:
- `month=YYYY-MM`

### 2) Por fecha especifica

`GET /api/estadisticas/productos/ventas?date=2026-08-06`

Formato:
- `date=YYYY-MM-DD`

### 3) Por rango

`GET /api/estadisticas/productos/ventas?fechaDesde=2026-08-01&fechaHasta=2026-08-31`

Acepta:
- `fechaDesde`
- `fechaHasta`
- aliases: `fecha_desde`, `fecha_hasta`

### 4) Solo productos disponibles

`GET /api/estadisticas/productos/ventas?month=2026-08&available=true`

## Base de calculo

La estadistica toma ventas de:
- `detalle_pedido`
- unidos a `pedidos`
- solo pedidos con estado `FACTURADO` o `CERRADO`

## Respuesta

```json
{
  "period": {
    "mode": "month",
    "label": "2026-08",
    "fechaDesde": "2026-08-01 00:00:00",
    "fechaHasta": "2026-08-31 23:59:59"
  },
  "summary": {
    "totalProducts": 20,
    "soldProducts": 12,
    "unsoldProducts": 8,
    "totalUnits": 145,
    "totalRevenue": 198500
  },
  "topProduct": {
    "productoId": 4,
    "productoCodigo": "P-004",
    "productoNombre": "Casado",
    "categoriaId": 2,
    "categoriaNombre": "Almuerzos",
    "disponible": true,
    "unidadesVendidas": 32,
    "totalVendido": 128000,
    "pedidosCount": 20
  },
  "bottomProduct": {
    "productoId": 8,
    "productoCodigo": "P-008",
    "productoNombre": "Cafe Negro",
    "categoriaId": 3,
    "categoriaNombre": "Bebidas",
    "disponible": true,
    "unidadesVendidas": 0,
    "totalVendido": 0,
    "pedidosCount": 0
  },
  "ranking": [],
  "charts": {
    "productsByUnits": {
      "labels": ["Casado", "Hamburguesa"],
      "datasets": [
        {
          "label": "Unidades vendidas",
          "data": [32, 20]
        }
      ]
    },
    "productsByRevenue": {
      "labels": ["Casado", "Hamburguesa"],
      "datasets": [
        {
          "label": "Total vendido",
          "data": [128000, 90000]
        }
      ]
    },
    "dailySales": {
      "labels": ["2026-08-01", "2026-08-02"],
      "datasets": [
        {
          "label": "Unidades vendidas por dia",
          "data": [22, 30]
        },
        {
          "label": "Monto vendido por dia",
          "data": [45000, 58000]
        }
      ]
    }
  },
  "dailySeries": []
}
```

## Qué usar en frontend

### Tarjetas resumen

Usar:
- `summary.totalUnits`
- `summary.totalRevenue`
- `summary.soldProducts`
- `summary.unsoldProducts`

### Producto mas vendido

Usar:
- `topProduct`

### Producto menos vendido

Usar:
- `bottomProduct`

Nota:
- `bottomProduct` puede ser un producto con 0 ventas en el rango.
- Si prefieres “menos vendido entre los que si vendieron”, frontend puede filtrar `ranking` con `unidadesVendidas > 0`.

### Graficas

Usar directamente:
- `charts.productsByUnits`
- `charts.productsByRevenue`
- `charts.dailySales`

Esto ya viene listo para librerias tipo:
- Chart.js
- ApexCharts
- Recharts
- ECharts

### Tabla ranking

Usar:
- `ranking`

Campos por fila:
- `productoNombre`
- `productoCodigo`
- `categoriaNombre`
- `unidadesVendidas`
- `totalVendido`
- `pedidosCount`

## Errores esperados

- `400` si el filtro de fechas es invalido.
- `401` si no hay token.
- `403` si el usuario no es `ADMIN`.
