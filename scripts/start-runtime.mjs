import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureRuntimeDatabaseReady } from "./runtime-db.mjs";
import { buildRuntimeEnv, waitForHealth } from "./runtime-env.mjs";

const webEntry = fileURLToPath(new URL("./start-standalone.mjs", import.meta.url));
const workerEntry = fileURLToPath(new URL("../worker/index.ts", import.meta.url));

const runtimeEnv = buildRuntimeEnv();
const children = [];
let isShuttingDown = false;

function log(message) {
  process.stdout.write(`[runtime] ${message}\n`);
}

function spawnProcess(name, args, env = runtimeEnv) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  const entry = { name, child };
  children.push(entry);
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

function shutdown(exitCode = 0, reason = "shutdown") {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  log(`${reason}; stopping runtime children`);

  for (const entry of children) {
    terminateChild(entry, "SIGTERM");
  }

  const forceKillTimer = setTimeout(() => {
    for (const entry of children) {
      terminateChild(entry, "SIGKILL");
    }
  }, 5_000);

  forceKillTimer.unref();

  setTimeout(() => {
    process.exit(exitCode);
  }, 100).unref();
}

function attachExitHandler(entry) {
  entry.child.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    const description = signal
      ? `${entry.name} exited via ${signal}`
      : `${entry.name} exited with code ${code ?? 0}`;

    shutdown(code ?? 1, description);
  });
}

async function main() {
  log("ensuring runtime database schema and bootstrap state");
  await ensureRuntimeDatabaseReady({ env: runtimeEnv });

  log(`starting web on ${runtimeEnv.INTERNAL_WEB_BASE_URL}`);
  const web = spawnProcess("web", [webEntry]);
  attachExitHandler(web);

  await waitForHealth(runtimeEnv.INTERNAL_WEB_BASE_URL);

  log("web is healthy; starting worker");
  const worker = spawnProcess("worker", ["--import", "tsx", workerEntry]);
  attachExitHandler(worker);
}

process.on("SIGINT", () => shutdown(0, "received SIGINT"));
process.on("SIGTERM", () => shutdown(0, "received SIGTERM"));

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  shutdown(1, `startup failed: ${message}`);
});