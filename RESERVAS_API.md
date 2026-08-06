# API de Reservas

> Nota: esta guia fue reemplazada por `CLIENTES_PEDIDOS_RESERVAS_API.md`, donde se documenta la integracion completa con `cliente_id` para pedidos y reservas.

## Resumen funcional

- Recurso principal: `reservas`.
- Roles con acceso: `ADMIN`, `MESERO`, `CAJERO`.
- Regla de negocio: una reserva bloquea la mesa **2 horas antes** de `fecha_hora`.
- Estados permitidos: `PENDIENTE`, `CONFIRMADA`, `ATENDIDA`, `CANCELADA`.
- Estados activos para bloqueo: `PENDIENTE`, `CONFIRMADA`.

## Base URL

- Prefijo: `/api/reservas`
- Todas las rutas requieren `Authorization: Bearer <token>`.

## Rutas

### Integracion con modulo de mesas

`GET /api/mesas?at=2026-08-07T15:00:00&active=true`

- Ahora devuelve `reservada` y `reservaActiva` por cada mesa.
- Estados que marcan reservada: `PENDIENTE`, `CONFIRMADA`.
- Estados que marcan disponible: `ATENDIDA`, `CANCELADA`.
- Si no se envia `at`, usa la hora actual del servidor.

### Integracion con modulo de pedidos

- Al crear pedido tipo `MESA` (`POST /api/pedidos`) o asignar/cambiar mesa en pedido (`PUT /api/pedidos/:id`),
  si la mesa tiene reserva activa en esa hora devuelve `409`.
- Respuesta de conflicto incluye datos de la reserva para mostrar mensaje en UI.

### 1) Estado de mesas para reservas

`GET /api/reservas/mesas/estado?at=2026-08-07T15:00:00`

Query params:
- `at` (opcional): fecha/hora de referencia para evaluar bloqueo. Si no se envia, usa `NOW()`.
- `includeInactive` (opcional): `1|true` para incluir mesas inactivas.

Respuesta:

```json
{
  "referenceDateTime": "2026-08-07 15:00:00",
  "mesas": [
    {
      "id": 2,
      "numero": 2,
      "capacidad": 4,
      "observacion": null,
      "activa": true,
      "createdAt": "2026-08-01T20:10:00.000Z",
      "reservada": true,
      "reservaActiva": {
        "id": 10,
        "nombreCliente": "Juan Perez",
        "telefono": "8888-8888",
        "fechaHora": "2026-08-07T17:00:00.000Z",
        "cantidadPersonas": 4,
        "observaciones": "Cumpleanos",
        "estado": "CONFIRMADA",
        "bloqueoInicio": "2026-08-07T15:00:00.000Z"
      }
    }
  ]
}
```

### 2) Listar reservas

`GET /api/reservas`

Filtros opcionales:
- `estado`
- `mesaId` o `mesa_id`
- `usuarioId` o `usuario_id`
- `fechaDesde` o `fecha_desde` (datetime)
- `fechaHasta` o `fecha_hasta` (datetime)
- `fecha` (YYYY-MM-DD) para traer agenda del dia completo

Ejemplo:

`GET /api/reservas?fecha=2026-08-07&estado=CONFIRMADA`

### 3) Obtener reserva por id

`GET /api/reservas/:id`

### 4) Crear reserva

`POST /api/reservas`

Body recomendado:

```json
{
  "mesaId": 2,
  "usuarioId": 5,
  "nombreCliente": "Juan Perez",
  "telefono": "8888-8888",
  "fechaHora": "2026-08-07T17:00:00",
  "cantidadPersonas": 4,
  "observaciones": "Cumpleanos",
  "estado": "CONFIRMADA"
}
```

Notas:
- Si no envias `usuarioId`, se usa el usuario autenticado.
- Si hay cruce de ventana de bloqueo en la misma mesa (2 horas antes), responde `409`.

### 5) Actualizar reserva completa

`PUT /api/reservas/:id`

- Puedes enviar campos parciales; los no enviados conservan el valor actual.
- Aplica validacion de conflictos si el estado queda en `PENDIENTE` o `CONFIRMADA`.

### 6) Cambiar solo estado

`PATCH /api/reservas/:id/estado`

Body:

```json
{
  "estado": "CANCELADA"
}
```

## Contrato sugerido para frontend

## Flujo UI (apartado de reservas)

1. Cargar mesas con estado actual:
- `GET /api/reservas/mesas/estado?at=<fechaHoraVista>`

2. Pintar tarjetas de mesa:
- `reservada = true` => estado visual "Reservada".
- `reservada = false` => estado visual "Disponible".

3. Al seleccionar mesa:
- Abrir modal con formulario de reserva.
- Campos: cliente, telefono, fechaHora, cantidadPersonas, observaciones, estado.

4. Guardar:
- `POST /api/reservas`.
- Si responde `409`, mostrar mensaje de conflicto y permitir elegir otra hora/mesa.

5. Agenda del dia:
- `GET /api/reservas?fecha=YYYY-MM-DD`.

## Validaciones cliente recomendadas

- `nombreCliente` obligatorio, max 150.
- `telefono` obligatorio, max 30.
- `cantidadPersonas` entero > 0.
- `fechaHora` obligatoria.
- `estado` en: `PENDIENTE`, `CONFIRMADA`, `ATENDIDA`, `CANCELADA`.

## Errores comunes esperados

- `400`: datos invalidos.
- `404`: reserva inexistente.
- `409`: conflicto por solapamiento de bloqueo o entidad no valida (mesa/usuario inactivo).
