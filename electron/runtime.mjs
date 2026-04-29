import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRuntimeEnv } from "../scripts/runtime-env.mjs";

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(electronDir, "..");

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function readJsonConfig(configPath) {
  if (!configPath) {
    return {};
  }

  const resolvedConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

  return JSON.parse(readFileSync(resolvedConfigPath, "utf8"));
}

function ensureSecret(filePath) {
  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf8").trim();
  }

  const secret = crypto.randomBytes(32).toString("base64");
  writeFileSync(filePath, `${secret}\n`, "utf8");
  return secret;
}

function replaceTemplate(value, replacements) {
  if (typeof value !== "string") {
    return value;
  }

  let resolved = value;

  for (const [token, replacement] of Object.entries(replacements)) {
    resolved = resolved.replaceAll(`{{${token}}}`, replacement);
  }

  return resolved;
}

export function buildElectronRuntime({
  userDataRoot = path.join(os.homedir(), ".hf-space-manager-electron"),
  configPath = process.env.HFSM_ELECTRON_CONFIG,
  env = process.env,
} = {}) {
  const runtimeRoot = ensureDir(path.join(userDataRoot, "hf-space-manager"));
  const dataDir = ensureDir(path.join(runtimeRoot, "data"));
  const logsDir = ensureDir(path.join(runtimeRoot, "logs"));
  const secretsDir = ensureDir(path.join(runtimeRoot, "secrets"));

  const appEncryptionKey = ensureSecret(path.join(secretsDir, "app-encryption-key"));
  const internalEventToken = ensureSecret(path.join(secretsDir, "internal-event-token"));
  const config = readJsonConfig(configPath);

  const replacements = {
    USER_DATA_DIR: userDataRoot,
    APP_ENCRYPTION_KEY: appEncryptionKey,
    INTERNAL_EVENT_TOKEN: internalEventToken,
  };

  const port = String(config.port ?? env.PORT ?? 3838);
  const databaseUrl = replaceTemplate(
    config.databaseUrl ?? `file:${path.join(dataDir, "hf-space-manager.db")}`,
    replacements,
  );
  const resolvedEncryptionKey = replaceTemplate(config.appEncryptionKey ?? appEncryptionKey, replacements);
  const resolvedInternalEventToken = replaceTemplate(
    config.internalEventToken ?? internalEventToken,
    replacements,
  );

  const runtimeEnv = buildRuntimeEnv(
    {
      PORT: port,
      DATABASE_URL: databaseUrl,
      APP_ENCRYPTION_KEY: resolvedEncryptionKey,
      BOOTSTRAP_ADMIN_NAME: config.bootstrapAdminName ?? env.BOOTSTRAP_ADMIN_NAME ?? "Admin",
      BOOTSTRAP_ADMIN_EMAIL: config.bootstrapAdminEmail ?? env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com",
      HF_SYNC_INTERVAL_SECONDS: String(config.hfSyncIntervalSeconds ?? env.HF_SYNC_INTERVAL_SECONDS ?? 60),
      HF_WAKE_LOOKAHEAD_SECONDS: String(config.hfWakeLookaheadSeconds ?? env.HF_WAKE_LOOKAHEAD_SECONDS ?? 120),
      INTERNAL_WEB_BASE_URL: replaceTemplate(
        config.internalWebBaseUrl ?? `http://127.0.0.1:${port}`,
        replacements,
      ),
      INTERNAL_EVENT_TOKEN: resolvedInternalEventToken,
    },
    { cwd: appRoot },
  );

  const runtimeVendorRoot = process.resourcesPath
    ? path.join(process.resourcesPath, "runtime-vendor")
    : path.join(appRoot, "runtime-vendor");
  const hasVendoredTsx = existsSync(path.join(runtimeVendorRoot, "node_modules", "tsx", "dist", "loader.mjs"));

  return {
    appRoot,
    runtimeRoot,
    dataDir,
    logsDir,
    secretsDir,
    webEntry: path.join(appRoot, "scripts", "start-standalone.mjs"),
    workerEntry: path.join(appRoot, "worker", "index.ts"),
    runtimeVendorRoot,
    hasVendoredTsx,
    port,
    baseUrl: runtimeEnv.INTERNAL_WEB_BASE_URL,
    env: runtimeEnv,
  };
}