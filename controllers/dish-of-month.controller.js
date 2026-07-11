const {
  createDishOfMonth,
  deactivateAllDishOfMonth,
  deactivateAllDishOfMonthExcept,
  findDishOfMonthById,
  findLatestActiveDishOfMonth,
  listDishOfMonthHistory,
  softDeleteDishOfMonth,
  updateDishOfMonth,
} = require("../models/dish-of-month.model");
const { findProductById } = require("../models/product.model");

function parseDishInput(body) {
  return {
    productoId: Number(body.productoId ?? body.producto_id),
    fechaInicio: String(body.fechaInicio ?? body.fecha_inicio ?? "").trim(),
    fechaFin: String(body.fechaFin ?? body.fecha_fin ?? "").trim(),
    activo: body.activo === 0 || body.activo === false ? 0 : 1,
  };
}

function isValidDateString(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function validateDishInput(input) {
  const missingFields = [];

  if (!Number.isInteger(input.productoId) || input.productoId <= 0) missingFields.push("productoId");
  if (!isValidDateString(input.fechaInicio)) missingFields.push("fechaInicio");
  if (!isValidDateString(input.fechaFin)) missingFields.push("fechaFin");

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          productoId: ["productoId", "producto_id"],
          fechaInicio: ["fechaInicio", "fecha_inicio"],
          fechaFin: ["fechaFin", "fecha_fin"],
        },
      },
    };
  }

  const startDate = normalizeDate(input.fechaInicio);
  const endDate = normalizeDate(input.fechaFin);

  if (endDate < startDate) {
    return {
      ok: false,
      status: 400,
      payload: { message: "fechaFin no puede ser menor que fechaInicio" },
    };
  }

  return {
    ok: true,
    value: {
      ...input,
      fechaInicio: startDate,
      fechaFin: endDate,
    },
  };
}

async function getCurrentDishOfMonthHandler(_req, res) {
  const dishOfMonth = await findLatestActiveDishOfMonth();
  res.json({ dishOfMonth });
}

async function listDishOfMonthHistoryHandler(_req, res) {
  const history = await listDishOfMonthHistory();
  res.json({ history });
}

async function createDishOfMonthHandler(req, res) {
  const parsed = parseDishInput(req.body || {});
  const validation = validateDishInput(parsed);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const input = validation.value;
  const product = await findProductById(input.productoId);

  if (!product || !product.disponible) {
    res.status(400).json({ message: "productoId invalido o producto no disponible" });
    return;
  }

  if (input.activo === 1) {
    await deactivateAllDishOfMonth();
  }

  const dishId = await createDishOfMonth(input);
  const dishOfMonth = await findDishOfMonthById(dishId);

  res.status(201).json({
    message: "Plato del mes creado exitosamente",
    dishOfMonth,
  });
}

async function updateDishOfMonthHandler(req, res) {
  const dishId = Number(req.params.id);
  if (!Number.isInteger(dishId) || dishId <= 0) {
    res.status(400).json({ message: "id de plato del mes invalido" });
    return;
  }

  const existingDish = await findDishOfMonthById(dishId);
  if (!existingDish) {
    res.status(404).json({ message: "Plato del mes no encontrado" });
    return;
  }

  const parsed = parseDishInput(req.body || {});
  const validation = validateDishInput(parsed);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const input = validation.value;
  const product = await findProductById(input.productoId);

  if (!product || !product.disponible) {
    res.status(400).json({ message: "productoId invalido o producto no disponible" });
    return;
  }

  await updateDishOfMonth(dishId, input);

  if (input.activo === 1) {
    await deactivateAllDishOfMonthExcept(dishId);
  }

  const updatedDish = await findDishOfMonthById(dishId);

  res.json({
    message: "Plato del mes actualizado exitosamente",
    dishOfMonth: updatedDish,
  });
}

async function deleteDishOfMonthHandler(req, res) {
  const dishId = Number(req.params.id);
  if (!Number.isInteger(dishId) || dishId <= 0) {
    res.status(400).json({ message: "id de plato del mes invalido" });
    return;
  }

  const existingDish = await findDishOfMonthById(dishId);
  if (!existingDish) {
    res.status(404).json({ message: "Plato del mes no encontrado" });
    return;
  }

  await softDeleteDishOfMonth(dishId);
  const updatedDish = await findDishOfMonthById(dishId);

  res.json({
    message: "Plato del mes desactivado exitosamente",
    dishOfMonth: updatedDish,
  });
}

module.exports = {
  getCurrentDishOfMonthHandler,
  listDishOfMonthHistoryHandler,
  createDishOfMonthHandler,
  updateDishOfMonthHandler,
  deleteDishOfMonthHandler,
};
