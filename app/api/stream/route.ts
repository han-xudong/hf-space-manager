import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { subscribeWorkspaceUpdates } from "@/lib/realtime/events";
import { getWorkspaceStreamPayload } from "@/lib/realtime/payload";

export const runtime = "nodejs";
const STREAM_FALLBACK_INTERVAL_MS = 3_000;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout | undefined;
  let unsubscribe: (() => void) | undefined;
  let closed = false;

  const close = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) {
      return;
    }

    closed = true;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = undefined;
    }

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = undefined;
    }

    if (controller) {
      try {
        controller.close();
      } catch {
        // Ignore repeated close attempts from aborted connections.
      }
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      let sending = false;
      let queued = false;

      const push = (payload: Uint8Array) => {
        if (closed) {
          return false;
        }

        try {
          controller.enqueue(payload);
          return true;
        } catch {
          close(controller);
          return false;
        }
      };

      const send = async () => {
        if (sending) {
          queued = true;
          return;
        }

        sending = true;

        try {
          do {
            queued = false;

            try {
              const payload = await getWorkspaceStreamPayload(session.user.workspaceId);
              push(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            } catch (error) {
              push(
                encoder.encode(
                  `data: ${JSON.stringify({ error: error instanceof Error ? error.message : "stream error" })}\n\n`,
                ),
              );
            }
          } while (queued && !closed);
        } finally {
          sending = false;
        }
      };

      unsubscribe = subscribeWorkspaceUpdates(session.user.workspaceId, () => {
        void send();
      });
      void send();
      intervalId = setInterval(() => {
        void send();
      }, STREAM_FALLBACK_INTERVAL_MS);

      push(encoder.encode(": connected\n\n"));
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}