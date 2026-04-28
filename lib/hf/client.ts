import { listSpaces, spaceInfo } from "@huggingface/hub";

type HfWhoAmI = {
  name: string;
  email?: string;
  auth?: {
    accessToken?: {
      role?: string;
    };
  };
};

export type NormalizedSpaceRuntime = {
  repoId: string;
  name: string;
  subdomain: string | null;
  sdk: string | null;
  visibility: "public" | "private";
  stage: string | null;
  hardware: string | null;
  requestedHardware: string | null;
  sleepTimeSeconds: number | null;
  lastModifiedAt: Date | null;
  rawPayload: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

async function hfFetch<T>(path: string, init: RequestInit & { token: string }): Promise<T> {
  const response = await fetch(`https://huggingface.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${init.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hugging Face API error ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();

  if (text.length === 0) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

function normalizeSpacePayload(space: Record<string, unknown>): NormalizedSpaceRuntime {
  const runtime = asRecord(space.runtime);
  const hardware = asRecord(runtime.hardware);
  const spaceName = readString(space.name);
  const spaceId = readString(space.id) ?? "";
  const canonicalName = spaceName && spaceName.length > 0 ? spaceName : spaceId;
  const lastModified = readString(space.lastModified);

  return {
    repoId: canonicalName,
    name: canonicalName?.split("/").at(-1) ?? canonicalName,
    subdomain: readString(space.subdomain),
    sdk: readString(space.sdk),
    visibility: readBoolean(space.private) ? "private" : "public",
    stage: readString(runtime.stage),
    hardware: readString(hardware.current),
    requestedHardware: readString(hardware.requested),
    sleepTimeSeconds: readNumber(runtime.gcTimeout),
    lastModifiedAt: lastModified ? new Date(lastModified) : null,
    rawPayload: space,
  };
}

export async function validateHfToken(token: string) {
  const response = await hfFetch<HfWhoAmI>("/api/whoami-v2", {
    method: "GET",
    token,
  });

  return {
    username: response.name,
    email: response.email ?? null,
    tokenRole: response.auth?.accessToken?.role ?? null,
  };
}

export async function listOwnedSpaces(token: string, username: string) {
  const spaces: NormalizedSpaceRuntime[] = [];

  for await (const space of listSpaces({
    accessToken: token,
    search: { owner: username },
    additionalFields: ["runtime", "subdomain"],
  })) {
    spaces.push(normalizeSpacePayload(space as unknown as Record<string, unknown>));
  }

  return spaces;
}

export async function getSpaceDetails(token: string, repoId: string) {
  const info = await spaceInfo({
    accessToken: token,
    name: repoId,
    additionalFields: ["runtime", "subdomain", "createdAt", "author"],
  });

  return normalizeSpacePayload(info as unknown as Record<string, unknown>);
}

export async function restartSpace(token: string, repoId: string, factoryReboot = false) {
  const params = new URLSearchParams();
  if (factoryReboot) {
    params.set("factory", "true");
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return hfFetch(`/api/spaces/${repoId}/restart${suffix}`, {
    method: "POST",
    token,
  });
}

export async function setSpaceSleepTime(token: string, repoId: string, sleepTimeSeconds: number) {
  return hfFetch(`/api/spaces/${repoId}/sleeptime`, {
    method: "POST",
    token,
    body: JSON.stringify({ seconds: sleepTimeSeconds }),
  });
}