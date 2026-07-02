const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ override: true });

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
});

async function main() {
  await pool.query("SELECT 1");
  console.log("Conexion a base de datos OK");
}

main()
  .catch((error) => {
    console.error("Error de conexion a base de datos:", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
