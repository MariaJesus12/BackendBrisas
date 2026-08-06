const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");

const { env } = require("./config/env");
const { pool } = require("./config/database");
const announcementRouter = require("./routes/announcement.routes");
const authRouter = require("./auth");
const categoryRouter = require("./routes/category.routes");
const clienteRouter = require("./routes/cliente.routes");
const dishOfMonthRouter = require("./routes/dish-of-month.routes");
const impresionRouter = require("./routes/impresion.routes");
const mesaRouter = require("./routes/mesa.routes");
const pedidoRouter = require("./routes/pedido.routes");
const productRouter = require("./routes/product.routes");
const reservaRouter = require("./routes/reserva.routes");
const roleRouter = require("./routes/role.routes");
const tipoCambioRouter = require("./routes/tipo-cambio.routes");
const monedaRouter = require("./routes/moneda.routes");
const userRouter = require("./routes/user.routes");

const app = express();
app.set("etag", false);
const allowedOrigins = env.corsOrigin
  ? env.corsOrigin
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : true;

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(morgan("dev"));
app.use(express.json());
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }

  next();
});

app.use("/api/auth", authRouter);
app.use("/api/announcements", announcementRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/clientes", clienteRouter);
app.use("/api/dish-of-month", dishOfMonthRouter);
app.use("/api/impresion", impresionRouter);
app.use("/api/mesas", mesaRouter);
app.use("/api/pedidos", pedidoRouter);
app.use("/api/products", productRouter);
app.use("/api/reservas", reservaRouter);
app.use("/api/roles", roleRouter);
app.use("/api/tipo-cambio", tipoCambioRouter);
app.use("/api/monedas", monedaRouter);
app.use("/api/users", userRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "backendbrisas" });
});

app.get("/health/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (error) {
    const isProd = env.nodeEnv === "production";
    res.status(500).json({
      ok: false,
      db: "disconnected",
      error: isProd ? "Database connection failed" : error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
