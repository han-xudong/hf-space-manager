import crypto from "node:crypto";

import { env } from "@/lib/env";

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  fingerprint: string;
};

function getEncryptionKey() {
  const raw = env.APP_ENCRYPTION_KEY;

  const candidates = [
    Buffer.from(raw, "base64"),
    Buffer.from(raw, "base64url"),
    Buffer.from(raw, "utf8"),
  ];

  const valid = candidates.find((candidate) => candidate.length === 32);
  if (!valid) {
    throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return valid;
}

export function encryptSecret(secret: string): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const fingerprint = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16);

  return {
    ciphertext: encrypted.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: authTag.toString("base64url"),
    fingerprint,
  };
}

export function decryptSecret(input: EncryptedSecret): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(input.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}