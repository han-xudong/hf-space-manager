import path from "node:path";

export function resolveRuntimePort(env = process.env) {
  return env.PORT ?? "3000";
}

export function normalizeDatabaseUrl(databaseUrl, cwd = process.cwd()) {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  const filePath = databaseUrl.slice("file:".length);

  if (filePath.startsWith("/")) {
    return databaseUrl;
  }

  return `file:${path.resolve(cwd, "prisma", filePath)}`;
}

export function resolveInternalWebBaseUrl(env = process.env) {
  return env.INTERNAL_WEB_BASE_URL ?? `http://127.0.0.1:${resolveRuntimePort(env)}`;
}

export function buildRuntimeEnv(envOverrides = {}, { cwd = process.cwd() } = {}) {
  const mergedEnv = {
    ...process.env,
    ...envOverrides,
  };

  const normalizedDatabaseUrl = normalizeDatabaseUrl(mergedEnv.DATABASE_URL, cwd);

  if (normalizedDatabaseUrl) {
    mergedEnv.DATABASE_URL = normalizedDatabaseUrl;
  }

  if (!mergedEnv.PORT) {
    mergedEnv.PORT = resolveRuntimePort(mergedEnv);
  }

  if (!mergedEnv.INTERNAL_WEB_BASE_URL) {
    mergedEnv.INTERNAL_WEB_BASE_URL = resolveInternalWebBaseUrl(mergedEnv);
  }

  return mergedEnv;
}

export async function waitForHealth(baseUrl, { timeoutMs = 30_000, intervalMs = 500 } = {}) {
  const healthUrl = new URL("/api/health", baseUrl).toString();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the timeout is reached.
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for health endpoint: ${healthUrl}`);
}