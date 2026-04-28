import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow } from "electron";

import { ensureRuntimeDatabaseReady } from "../scripts/runtime-db.mjs";
import { waitForHealth } from "../scripts/runtime-env.mjs";
import { buildElectronRuntime } from "./runtime.mjs";

const preloadPath = fileURLToPath(new URL("./preload.mjs", import.meta.url));
const smokeTest = process.env.ELECTRON_SMOKE_TEST === "1";

let mainWindow = null;
let runtime = null;
let isShuttingDown = false;
const children = [];

function log(message) {
  process.stdout.write(`[electron] ${message}\n`);
}

function spawnRuntimeProcess(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: runtime.appRoot,
    env: {
      ...runtime.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  const entry = { name, child };
  children.push(entry);

  child.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    const description = signal ? `${name} exited via ${signal}` : `${name} exited with code ${code ?? 0}`;
    log(description);
    app.quit();
  });

  return entry;
}

function terminateChild(entry, signal = "SIGTERM") {
  const { child } = entry;

  if (child.exitCode !== null || child.killed) {
    return;
  }

  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
      return;
    }

    child.kill(signal);
  } catch {
    child.kill(signal);
  }
}

function shutdownChildren() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const entry of children) {
    terminateChild(entry, "SIGTERM");
  }

  const forceKillTimer = setTimeout(() => {
    for (const entry of children) {
      terminateChild(entry, "SIGKILL");
    }
  }, 5_000);

  forceKillTimer.unref();
}

async function startRuntime() {
  runtime = buildElectronRuntime({ userDataRoot: app.getPath("userData") });

  log("ensuring local database schema and bootstrap state");
  await ensureRuntimeDatabaseReady({ appRoot: runtime.appRoot, env: runtime.env });

  log(`starting local web runtime on ${runtime.baseUrl}`);
  spawnRuntimeProcess("web", [runtime.webEntry]);
  await waitForHealth(runtime.baseUrl);

  log("web runtime is healthy; starting worker runtime");
  spawnRuntimeProcess("worker", ["--import", "tsx", runtime.workerEntry]);
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (!smokeTest) {
    mainWindow.once("ready-to-show", () => {
      mainWindow?.show();
    });
  }

  await mainWindow.loadURL(`${runtime.baseUrl}/dashboard`);

  if (smokeTest) {
    setTimeout(() => app.quit(), 1_000).unref();
  }
}

app.on("before-quit", shutdownChildren);

app.whenReady().then(async () => {
  await startRuntime();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0 && runtime) {
      await createMainWindow();
    }
  });
}).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  log(`startup failed: ${message}`);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smokeTest) {
    app.quit();
  }
});