# Integracion de Clientes con Pedidos y Reservas

## Objetivo

- Centralizar datos de cliente en `clientes`.
- Usar `cliente_id` en pedidos y reservas.
- Permitir busqueda, seleccion, alta, edicion y baja logica de clientes.

## Tabla clientes

- `id` int PK
- `nombre` varchar(150)
- `telefono` varchar(20)
- `observaciones` varchar(255)
- `activo` tinyint(1)
- `created_at` timestamp
- `updated_at` timestamp

## Seguridad

Todas las rutas abajo requieren:
- `Authorization: Bearer <token>`
- Roles: `ADMIN`, `MESERO`, `CAJERO`

## Rutas de clientes

Base: `/api/clientes`

### 1) Listar / buscar clientes

`GET /api/clientes`

Query params opcionales:
- `active=1|true` para solo activos
- `q=<texto>` busca por nombre o telefono
- `nombre=<texto>` filtro por nombre
- `telefono=<texto>` filtro por telefono

Respuesta:

```json
{
  "clientes": [
    {
      "id": 1,
      "nombre": "Juan Perez",
      "telefono": "8888-8888",
      "observaciones": "Cliente frecuente",
      "activo": true,
      "createdAt": "2026-08-06T12:00:00.000Z",
      "updatedAt": "2026-08-06T12:00:00.000Z"
    }
  ]
}
```

### 2) Ver cliente

`GET /api/clientes/:id`

### 3) Crear cliente

`POST /api/clientes`

Body:

```json
{
  "nombre": "Juan Perez",
  "telefono": "8888-8888",
  "observaciones": "Cliente frecuente",
  "activo": true
}
```

### 4) Editar cliente

`PUT /api/clientes/:id`

Body permitido (parcial o completo):

```json
{
  "nombre": "Juan Perez",
  "telefono": "8888-0000",
  "observaciones": "Actualizar telefono",
  "activo": true
}
```

### 5) Eliminar cliente (baja logica)

`DELETE /api/clientes/:id`

- No borra fisicamente, cambia `activo = 0`.

## Cambios en pedidos

Base: `/api/pedidos`

## Reglas

- `tipo=MESA`: `mesaId` obligatorio, `clienteId` opcional.
- `tipo=LLEVAR`: `clienteId` obligatorio, `mesaId` se fuerza a `null`.
- Si `clienteId` no existe o esta inactivo, devuelve `400`.

## Campos nuevos

En respuestas de pedido:
- `clienteId`
- `clienteNombre`
- `clienteTelefono`

## Crear pedido para llevar

`POST /api/pedidos`

```json
{
  "tipo": "LLEVAR",
  "clienteId": 1,
  "usuarioId": 5,
  "estado": "BORRADOR",
  "detalles": []
}
```

## Actualizar pedido

`PUT /api/pedidos/:id`

Puedes enviar `clienteId` para cambiar el cliente del pedido.

## Filtrar pedidos por cliente

`GET /api/pedidos?clienteId=1`

## Cambios en reservas

Base: `/api/reservas`

## Reglas

- `clienteId` obligatorio en creacion/edicion.
- `nombre_cliente` y `telefono` de la tabla reservas ya no se toman del body.
- El backend usa datos de `clientes` y los sincroniza.

## Crear reserva

`POST /api/reservas`

```json
{
  "mesaId": 2,
  "clienteId": 1,
  "usuarioId": 5,
  "fechaHora": "2026-08-07T17:00:00",
  "cantidadPersonas": 4,
  "observaciones": "Cumpleanos",
  "estado": "CONFIRMADA"
}
```

## Editar reserva

`PUT /api/reservas/:id`

```json
{
  "clienteId": 1,
  "fechaHora": "2026-08-07T18:00:00",
  "estado": "PENDIENTE"
}
```

## Filtrar reservas por cliente

`GET /api/reservas?clienteId=1`

## Estado de mesas con reserva activa

`GET /api/reservas/mesas/estado?at=2026-08-07T15:00:00`

- `PENDIENTE` y `CONFIRMADA` bloquean mesa.
- `ATENDIDA` y `CANCELADA` no bloquean.

## Flujo recomendado para frontend

1. En pantalla de pedidos/reservas, abrir modal de seleccion de cliente.
2. Consumir `GET /api/clientes?active=true&q=<texto>` para busqueda incremental.
3. Permitir crear cliente rapido con `POST /api/clientes` desde el modal.
4. Guardar siempre `clienteId` en pedidos para llevar y en reservas.
5. Mostrar `clienteNombre` y `clienteTelefono` devueltos por backend para tickets y reimpresion.

## Errores esperados

- `400`: datos invalidos, cliente no existe o inactivo.
- `404`: recurso no encontrado.
- `409`: conflicto de reglas (por ejemplo, reserva cruzada).
