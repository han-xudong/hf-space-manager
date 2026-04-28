import { spawn } from "node:child_process";
import process from "node:process";

const packageManagerExec = process.env.npm_execpath;
const packageManagerName = process.env.npm_config_user_agent?.split("/")[0] ?? "package-manager";
const nodeExec = process.execPath;
const webArgs = process.argv.slice(2);

if (!packageManagerExec) {
  throw new Error("Missing npm_execpath; cannot determine the active package manager.");
}

const children = [];
let isShuttingDown = false;

function resolveWebPort(args) {
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === "--port") {
      return args[index + 1] ?? null;
    }

    if (current?.startsWith("--port=")) {
      return current.slice("--port=".length);
    }
  }

  return process.env.PORT ?? "3000";
}

function log(message) {
  process.stdout.write(`[dev] ${message}\n`);
}

function spawnScript(name, extraArgs = [], envOverrides = {}) {
  const child = spawn(nodeExec, [packageManagerExec, "run", name, "--", ...extraArgs], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...envOverrides,
    },
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  children.push({ name, child });
  return child;
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
  log(`${reason}; stopping web and worker`);

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

log(`starting web and worker with ${packageManagerName}`);

const resolvedWebPort = resolveWebPort(webArgs);

const web = spawnScript("dev:web", webArgs);
const worker = spawnScript("dev:worker", [], {
  INTERNAL_WEB_BASE_URL: process.env.INTERNAL_WEB_BASE_URL ?? `http://127.0.0.1:${resolvedWebPort}`,
});

for (const [name, child] of [
  ["web", web],
  ["worker", worker],
]) {
  child.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    const description = signal ? `${name} exited via ${signal}` : `${name} exited with code ${code ?? 0}`;
    shutdown(code ?? 1, description);
  });
}

process.on("SIGINT", () => shutdown(0, "received SIGINT"));
process.on("SIGTERM", () => shutdown(0, "received SIGTERM"));
