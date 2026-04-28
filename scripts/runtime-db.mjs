import { spawn } from "node:child_process";
import path from "node:path";

function runNodeCommand(args, { cwd, env, label }) {
  return new Promise((resolve, reject) => {
    const childEnv = {
      ...env,
    };

    if (process.versions.electron) {
      childEnv.ELECTRON_RUN_AS_NODE = "1";
    }

    const child = spawn(process.execPath, args, {
      cwd,
      env: childEnv,
      stdio: "inherit",
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const description = signal ? `${label} exited via ${signal}` : `${label} exited with code ${code ?? 1}`;
      reject(new Error(description));
    });
  });
}

export async function ensureRuntimeDatabaseReady({ appRoot = process.cwd(), env = process.env } = {}) {
  const prismaCliEntry = path.join(appRoot, "node_modules", "prisma", "build", "index.js");
  const seedEntry = path.join(appRoot, "prisma", "seed.ts");

  await runNodeCommand([prismaCliEntry, "db", "push", "--skip-generate"], {
    cwd: appRoot,
    env,
    label: "prisma db push",
  });

  await runNodeCommand(["--import", "tsx", seedEntry], {
    cwd: appRoot,
    env,
    label: "prisma seed",
  });
}