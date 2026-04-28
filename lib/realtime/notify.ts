import { env } from "@/lib/env";

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function notifyWorkspaceUpdate(workspaceId: string) {
  try {
    await fetch(`${normalizeBaseUrl(env.INTERNAL_WEB_BASE_URL)}/api/internal/workspace-updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-event-token": env.INTERNAL_EVENT_TOKEN,
      },
      body: JSON.stringify({ workspaceId }),
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });
  } catch (error) {
    console.error("[realtime] failed to notify web process", error);
  }
}