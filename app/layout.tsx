import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { getWorkspaceSummary } from "@/lib/app-data";
import { requireUserSession } from "@/lib/auth/session";

import "./globals.css";

export const metadata: Metadata = {
  title: "HF Space Manager",
  description: "A self-hosted Hugging Face Space operations console built with Next.js.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUserSession();
  const summary = await getWorkspaceSummary(session.user.workspaceId);

  return (
    <html lang="en">
      <body>
        <AppShell needsConnectionSetup={summary.connectionsCount === 0}>{children}</AppShell>
      </body>
    </html>
  );
}