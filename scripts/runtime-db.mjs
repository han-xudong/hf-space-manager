import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function runNodeCommand(args, { cwd, env, label }) {
  return new Promise((resolve, reject) => {
    const childEnv = {
      ...env,
    };
    const runtimeVendorRoot = process.resourcesPath
      ? path.join(process.resourcesPath, "runtime-vendor")
      : path.join(cwd, "runtime-vendor");
    const runtimeNodePath = path.join(runtimeVendorRoot, "node_modules");

    if (existsSync(runtimeNodePath)) {
      childEnv.NODE_PATH = childEnv.NODE_PATH
        ? `${runtimeNodePath}${path.delimiter}${childEnv.NODE_PATH}`
        : runtimeNodePath;
    }

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
  const runtimeVendorRoot = process.resourcesPath
    ? path.join(process.resourcesPath, "runtime-vendor")
    : path.join(appRoot, "runtime-vendor");
  const vendoredPrismaCliEntry = path.join(runtimeVendorRoot, "node_modules", "prisma", "build", "index.js");
  const prismaCliEntry = existsSync(vendoredPrismaCliEntry)
    ? vendoredPrismaCliEntry
    : path.join(appRoot, "node_modules", "prisma", "build", "index.js");
  const seedEntry = path.join(appRoot, "scripts", "runtime-seed.mjs");

  await runNodeCommand([prismaCliEntry, "db", "push", "--skip-generate"], {
    cwd: appRoot,
    env,
    label: "prisma db push",
  });

  await runNodeCommand([seedEntry], {
    cwd: appRoot,
    env,
    label: "prisma seed",
  });
}