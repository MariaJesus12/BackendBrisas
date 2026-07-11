const {
  countAvailableProductsByCategory,
  createCategory,
  findCategoryById,
  findCategoryByName,
  listCategories,
  softDeleteCategory,
  updateCategory,
} = require("../models/category.model");
const { listProducts } = require("../models/product.model");

async function listCategoriesHandler(req, res) {
  const onlyActive = req.query.active === "1" || req.query.active === "true";
  const categories = await listCategories({ onlyActive });
  res.json({ categories });
}

async function createCategoryHandler(req, res) {
  const body = req.body || {};
  const nombre = String(body.nombre || "").trim();
  const activo = body.activo === 0 || body.activo === false ? 0 : 1;

  if (!nombre) {
    res.status(400).json({ message: "El nombre de la categoria es requerido" });
    return;
  }

  if (nombre.length > 100) {
    res.status(400).json({ message: "El nombre de la categoria no puede exceder 100 caracteres" });
    return;
  }

  const existingCategory = await findCategoryByName(nombre);
  if (existingCategory) {
    res.status(409).json({ message: "Ya existe una categoria con ese nombre" });
    return;
  }

  const categoryId = await createCategory({ nombre, activo });
  const category = await findCategoryById(categoryId);

  res.status(201).json({
    message: "Categoria creada exitosamente",
    category,
  });
}

async function updateCategoryHandler(req, res) {
  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    res.status(400).json({ message: "id de categoria invalido" });
    return;
  }

  const existingCategory = await findCategoryById(categoryId);
  if (!existingCategory) {
    res.status(404).json({ message: "Categoria no encontrada" });
    return;
  }

  const body = req.body || {};
  const nombre = String(body.nombre || "").trim();
  const activo = body.activo === 0 || body.activo === false ? 0 : 1;

  if (!nombre) {
    res.status(400).json({ message: "El nombre de la categoria es requerido" });
    return;
  }

  if (nombre.length > 100) {
    res.status(400).json({ message: "El nombre de la categoria no puede exceder 100 caracteres" });
    return;
  }

  const duplicatedByName = await findCategoryByName(nombre);
  if (duplicatedByName && duplicatedByName.id !== categoryId) {
    res.status(409).json({ message: "Ya existe otra categoria con ese nombre" });
    return;
  }

  await updateCategory(categoryId, { nombre, activo });
  const updatedCategory = await findCategoryById(categoryId);

  res.json({
    message: "Categoria actualizada exitosamente",
    category: updatedCategory,
  });
}

async function deleteCategoryHandler(req, res) {
  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    res.status(400).json({ message: "id de categoria invalido" });
    return;
  }

  const existingCategory = await findCategoryById(categoryId);
  if (!existingCategory) {
    res.status(404).json({ message: "Categoria no encontrada" });
    return;
  }

  const productsCount = await countAvailableProductsByCategory(categoryId);
  if (productsCount > 0) {
    res.status(409).json({
      message: "No se puede desactivar la categoria porque tiene productos disponibles",
      productsCount,
    });
    return;
  }

  await softDeleteCategory(categoryId);
  const updatedCategory = await findCategoryById(categoryId);

  res.json({
    message: "Categoria desactivada exitosamente",
    category: updatedCategory,
  });
}

async function listProductsByCategoryHandler(req, res) {
  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    res.status(400).json({ message: "id de categoria invalido" });
    return;
  }

  const category = await findCategoryById(categoryId);
  if (!category) {
    res.status(404).json({ message: "Categoria no encontrada" });
    return;
  }

  const onlyAvailable = req.query.available === "1" || req.query.available === "true";
  const products = await listProducts({ categoriaId: categoryId, onlyAvailable });

  res.json({
    category,
    products,
  });
}

module.exports = {
  listCategoriesHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
  listProductsByCategoryHandler,
};
