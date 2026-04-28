import path from "node:path";

import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";
const devDefaultDatabaseUrl = "file:../data/hf-space-manager.db";
const devDefaultEncryptionKey = "local-dev-encryption-key-1234567";
const devDefaultInternalWebBaseUrl = `http://127.0.0.1:${process.env.PORT ?? "3000"}`;

function normalizeDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  const filePath = databaseUrl.slice("file:".length);

  if (filePath.startsWith("/")) {
    return databaseUrl;
  }

  return `file:${path.resolve(process.cwd(), "prisma", filePath)}`;
}

function decodesTo32Bytes(value: string) {
  const candidates = [
    Buffer.from(value, "base64"),
    Buffer.from(value, "base64url"),
    Buffer.from(value, "utf8"),
  ];

  return candidates.some((candidate) => candidate.length === 32);
}

const resolvedDatabaseUrl = process.env.DATABASE_URL ?? (isProduction ? undefined : devDefaultDatabaseUrl);
const resolvedEncryptionKey = process.env.APP_ENCRYPTION_KEY ?? (isProduction ? undefined : devDefaultEncryptionKey);
const resolvedInternalEventToken = process.env.INTERNAL_EVENT_TOKEN ?? resolvedEncryptionKey;
const resolvedInternalWebBaseUrl = process.env.INTERNAL_WEB_BASE_URL ?? (isProduction ? `http://127.0.0.1:${process.env.PORT ?? "3000"}` : devDefaultInternalWebBaseUrl);
const normalizedDatabaseUrl = normalizeDatabaseUrl(resolvedDatabaseUrl);

if (normalizedDatabaseUrl) {
  process.env.DATABASE_URL = normalizedDatabaseUrl;
}

if (resolvedEncryptionKey) {
  process.env.APP_ENCRYPTION_KEY = resolvedEncryptionKey;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z
    .string()
    .min(16)
    .refine(decodesTo32Bytes, "APP_ENCRYPTION_KEY must decode to exactly 32 bytes."),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1).default("Admin"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  HF_SYNC_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  HF_WAKE_LOOKAHEAD_SECONDS: z.coerce.number().int().positive().default(120),
  INTERNAL_WEB_BASE_URL: z.string().url(),
  INTERNAL_EVENT_TOKEN: z.string().min(16),
});

const parsedEnv = envSchema.safeParse({
  DATABASE_URL: normalizedDatabaseUrl,
  APP_ENCRYPTION_KEY: resolvedEncryptionKey,
  BOOTSTRAP_ADMIN_NAME: process.env.BOOTSTRAP_ADMIN_NAME,
  BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
  HF_SYNC_INTERVAL_SECONDS: process.env.HF_SYNC_INTERVAL_SECONDS,
  HF_WAKE_LOOKAHEAD_SECONDS: process.env.HF_WAKE_LOOKAHEAD_SECONDS,
  INTERNAL_WEB_BASE_URL: resolvedInternalWebBaseUrl,
  INTERNAL_EVENT_TOKEN: resolvedInternalEventToken,
});

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsedEnv.data;