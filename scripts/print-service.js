const dotenv = require("dotenv");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "..", ".env.print") });

const execFileAsync = promisify(execFile);

const config = {
  apiBaseUrl: process.env.PRINT_API_BASE_URL || "http://localhost:3000/api",
  token: process.env.PRINT_API_TOKEN || "",
  username: process.env.PRINT_API_USERNAME || "",
  password: process.env.PRINT_API_PASSWORD || "",
  pollIntervalMs: Number(process.env.PRINT_POLL_INTERVAL_MS || 1000),
  filterType: process.env.PRINT_FILTER_TYPE ? String(process.env.PRINT_FILTER_TYPE).trim().toUpperCase() : "",
  printerId: process.env.PRINT_PRINTER_ID ? Number(process.env.PRINT_PRINTER_ID) : null,
  tempDir: process.env.PRINT_TEMP_DIR || os.tmpdir(),
};

let accessToken = config.token;
let stopping = false;

function ensureConfig() {
  if (!config.apiBaseUrl) {
    throw new Error("Falta PRINT_API_BASE_URL");
  }

  if (!accessToken && !(config.username && config.password)) {
    throw new Error("Debes configurar PRINT_API_TOKEN o PRINT_API_USERNAME y PRINT_API_PASSWORD");
  }

  if (!Number.isInteger(config.pollIntervalMs) || config.pollIntervalMs <= 0) {
    throw new Error("PRINT_POLL_INTERVAL_MS debe ser un entero positivo");
  }

  if (config.filterType && !["COCINA", "FACTURA"].includes(config.filterType)) {
    throw new Error("PRINT_FILTER_TYPE debe ser COCINA o FACTURA");
  }

  if (config.printerId != null && (!Number.isInteger(config.printerId) || config.printerId <= 0)) {
    throw new Error("PRINT_PRINTER_ID debe ser un entero positivo");
  }
}

async function apiFetch(pathname, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${config.apiBaseUrl}${pathname}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function loginIfNeeded(force = false) {
  if (accessToken && !force) {
    return accessToken;
  }

  if (!(config.username && config.password)) {
    return accessToken;
  }

  const payload = await apiFetch("/auth/login", {
    method: "POST",
    headers: {},
    body: JSON.stringify({
      usuario: config.username,
      password: config.password,
    }),
  });

  accessToken = payload.token;
  return accessToken;
}

async function authenticatedFetch(pathname, options = {}) {
  try {
    if (!accessToken) {
      await loginIfNeeded();
    }

    return await apiFetch(pathname, options);
  } catch (error) {
    if (error.status === 401 && config.username && config.password) {
      await loginIfNeeded(true);
      return apiFetch(pathname, options);
    }

    throw error;
  }
}

async function claimNextJob() {
  const body = {};

  if (config.filterType) {
    body.tipo = config.filterType;
  }

  if (config.printerId) {
    body.impresoraId = config.printerId;
  }

  try {
    const payload = await authenticatedFetch("/impresion/cola/next", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return payload.job;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }

    throw error;
  }
}

async function updateJobStatus(jobId, status, message) {
  await authenticatedFetch(`/impresion/cola/${jobId}/status`, {
    method: "PUT",
    body: JSON.stringify({
      estado: status,
      mensajeError: message || null,
      fechaImpresion: status === "IMPRESO" ? new Date().toISOString() : null,
    }),
  });
}

async function printText(printerName, content, copies) {
  const tempFilePath = path.join(config.tempDir, `backendbrisas-print-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);

  await fs.writeFile(tempFilePath, content, "utf8");

  try {
    for (let index = 0; index < copies; index += 1) {
      const command = [
        "-NoProfile",
        "-Command",
        `Get-Content -Path '${tempFilePath.replace(/'/g, "''")}' | Out-Printer -Name '${String(printerName).replace(/'/g, "''")}'`,
      ];

      await execFileAsync("powershell.exe", command, {
        windowsHide: true,
      });
    }
  } finally {
    await fs.unlink(tempFilePath).catch(() => {});
  }
}

async function processJob(job) {
  const jobType = String(job.tipo || "").trim().toUpperCase();

  if (config.filterType && jobType !== config.filterType) {
    const message = `Trabajo ${job.id} rechazado: tipo ${jobType || "N/D"} no coincide con filtro ${config.filterType}`;
    console.error(`[PRINT] ${message}`);
    await updateJobStatus(job.id, "ERROR", message);
    return;
  }

  if (config.printerId && Number(job.impresoraId) !== Number(config.printerId)) {
    const message = `Trabajo ${job.id} rechazado: impresora ${job.impresoraId || "N/D"} no coincide con PRINT_PRINTER_ID=${config.printerId}`;
    console.error(`[PRINT] ${message}`);
    await updateJobStatus(job.id, "ERROR", message);
    return;
  }

  console.log(`[PRINT] Procesando trabajo ${job.id} para ${job.impresoraSistema}`);

  try {
    await printText(job.impresoraSistema, job.contenido, Number(job.copias) || 1);
    await updateJobStatus(job.id, "IMPRESO");
    console.log(`[PRINT] Trabajo ${job.id} impreso correctamente`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[PRINT] Error en trabajo ${job.id}: ${message}`);
    await updateJobStatus(job.id, "ERROR", message);
  }
}

async function loop() {
  while (!stopping) {
    try {
      const job = await claimNextJob();
      if (job) {
        await processJob(job);
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PRINT] ${message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

function setupShutdownSignals() {
  const stop = () => {
    stopping = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

async function main() {
  ensureConfig();
  setupShutdownSignals();

  if (!accessToken) {
    await loginIfNeeded();
  }

  console.log("[PRINT] Servicio de impresion iniciado");
  console.log(`[PRINT] API: ${config.apiBaseUrl}`);
  console.log(`[PRINT] Filtro tipo: ${config.filterType || "TODOS"}`);
  console.log(`[PRINT] Printer ID: ${config.printerId || "TODAS"}`);

  await loop();

  console.log("[PRINT] Servicio detenido");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[PRINT] Error fatal: ${message}`);
  process.exit(1);
});
