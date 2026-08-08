const dotenv = require("dotenv");

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Falta la variable DATABASE_URL");
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("Falta la variable JWT_SECRET");
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  databaseUrl,
  corsOrigin: process.env.CORS_ORIGIN,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  inactivityHours: Number(process.env.SESSION_INACTIVITY_HOURS || 5),
};

module.exports = { env };
