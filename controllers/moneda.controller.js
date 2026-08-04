const { findMonedaById, listMonedas } = require("../models/moneda.model");

async function listMonedasHandler(req, res) {
  const onlyActive = req.query.active === "1" || req.query.active === "true";
  const monedas = await listMonedas({ onlyActive });

  res.json({ monedas });
}

async function getMonedaByIdHandler(req, res) {
  const monedaId = Number(req.params.id);
  if (!Number.isInteger(monedaId) || monedaId <= 0) {
    res.status(400).json({ message: "id de moneda invalido" });
    return;
  }

  const moneda = await findMonedaById(monedaId);
  if (!moneda) {
    res.status(404).json({ message: "Moneda no encontrada" });
    return;
  }

  res.json({ moneda });
}

module.exports = {
  listMonedasHandler,
  getMonedaByIdHandler,
};
