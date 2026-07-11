const { findCategoryById } = require("../models/category.model");
const {
  createProduct,
  findProductByCode,
  findProductById,
  listProducts,
  softDeleteProduct,
  updateProduct,
} = require("../models/product.model");

function toPriceCents(value) {
  return Math.round(Number(value) * 100);
}

function parseProductInput(body) {
  return {
    codigo: String(body.codigo || "").trim(),
    nombre: String(body.nombre || "").trim(),
    descripcion: body.descripcion == null ? null : String(body.descripcion).trim(),
    precio: Number(body.precio),
    imagen: body.imagen == null ? null : String(body.imagen).trim(),
    categoriaId: Number(body.categoriaId ?? body.categoria_id),
    disponible: body.disponible === 0 || body.disponible === false ? 0 : 1,
  };
}

function validateProductInput(product) {
  const missingFields = [];

  if (!product.codigo) missingFields.push("codigo");
  if (!product.nombre) missingFields.push("nombre");
  if (!Number.isFinite(product.precio)) missingFields.push("precio");
  if (!Number.isInteger(product.categoriaId) || product.categoriaId <= 0) missingFields.push("categoriaId");

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          categoriaId: ["categoriaId", "categoria_id"],
        },
      },
    };
  }

  if (product.codigo.length > 30) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El codigo no puede exceder 30 caracteres" },
    };
  }

  if (product.nombre.length > 150) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El nombre no puede exceder 150 caracteres" },
    };
  }

  if (product.descripcion && product.descripcion.length > 65535) {
    return {
      ok: false,
      status: 400,
      payload: { message: "La descripcion es demasiado larga" },
    };
  }

  if (product.imagen && product.imagen.length > 255) {
    return {
      ok: false,
      status: 400,
      payload: { message: "La URL de imagen no puede exceder 255 caracteres" },
    };
  }

  if (product.precio < 0) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El precio no puede ser negativo" },
    };
  }

  return { ok: true };
}

async function listProductsHandler(req, res) {
  const onlyAvailable = req.query.available === "1" || req.query.available === "true";
  const categoriaId = req.query.categoriaId ? Number(req.query.categoriaId) : undefined;

  if (req.query.categoriaId && (!Number.isInteger(categoriaId) || categoriaId <= 0)) {
    res.status(400).json({ message: "categoriaId invalido" });
    return;
  }

  const products = await listProducts({ onlyAvailable, categoriaId });
  res.json({ products });
}

async function createProductHandler(req, res) {
  const productInput = parseProductInput(req.body || {});
  const validation = validateProductInput(productInput);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const existingProduct = await findProductByCode(productInput.codigo);
  if (existingProduct) {
    res.status(409).json({ message: "Ya existe un producto con ese codigo" });
    return;
  }

  const category = await findCategoryById(productInput.categoriaId);
  if (!category || !category.activo) {
    res.status(400).json({ message: "categoriaId invalido o categoria inactiva" });
    return;
  }

  const productId = await createProduct(productInput);
  let product = await findProductById(productId);

  if (product && toPriceCents(product.precio) !== toPriceCents(productInput.precio)) {
    await updateProduct(productId, productInput);
    product = await findProductById(productId);
  }

  res.status(201).json({
    message: "Producto creado exitosamente",
    product,
  });
}

async function updateProductHandler(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    res.status(400).json({ message: "id de producto invalido" });
    return;
  }

  const existingProduct = await findProductById(productId);
  if (!existingProduct) {
    res.status(404).json({ message: "Producto no encontrado" });
    return;
  }

  const productInput = parseProductInput(req.body || {});
  const validation = validateProductInput(productInput);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const duplicatedByCode = await findProductByCode(productInput.codigo);
  if (duplicatedByCode && duplicatedByCode.id !== productId) {
    res.status(409).json({ message: "Ya existe otro producto con ese codigo" });
    return;
  }

  const category = await findCategoryById(productInput.categoriaId);
  if (!category || !category.activo) {
    res.status(400).json({ message: "categoriaId invalido o categoria inactiva" });
    return;
  }

  await updateProduct(productId, productInput);
  let updatedProduct = await findProductById(productId);

  if (updatedProduct && toPriceCents(updatedProduct.precio) !== toPriceCents(productInput.precio)) {
    await updateProduct(productId, productInput);
    updatedProduct = await findProductById(productId);
  }

  res.json({
    message: "Producto actualizado exitosamente",
    product: updatedProduct,
  });
}

async function deleteProductHandler(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    res.status(400).json({ message: "id de producto invalido" });
    return;
  }

  const existingProduct = await findProductById(productId);
  if (!existingProduct) {
    res.status(404).json({ message: "Producto no encontrado" });
    return;
  }

  await softDeleteProduct(productId);
  const updatedProduct = await findProductById(productId);

  res.json({
    message: "Producto desactivado exitosamente",
    product: updatedProduct,
  });
}

module.exports = {
  listProductsHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
};
