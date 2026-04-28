"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConnectionOnboardingDialog } from "@/components/connection-onboarding-dialog";
import { LocalTimestamp } from "@/components/local-timestamp";

type Connection = {
  id: string;
  label: string;
  username: string;
  tokenRole: string | null;
  lastValidatedAt: string | null;
  maskedToken: string;
  trackedSpacesCount: number;
};

type Props = {
  connections: Connection[];
  canManage: boolean;
};

export function ConnectionManager({ connections, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function syncConnection(connectionId: string) {
    setError(null);

    const response = await fetch(`/api/connections/${connectionId}/sync`, {
      method: "POST",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Sync failed." }));
      setError(body.error ?? "Sync failed.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <section className="panel stack-lg">
      <div className="panel-header">
        <div>
          <h2>Connections</h2>
        </div>
        {canManage ? (
          <button className="button" type="button" onClick={() => setIsDialogOpen(true)}>
            Add connection
          </button>
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="stack-md">
        {connections.map((connection) => (
          <article className="list-card" key={connection.id}>
            <div>
              <h3>{connection.label}</h3>
              <p className="muted meta-inline">
                <span>@{connection.username}</span>
                <span>token {connection.maskedToken}</span>
                <span>{connection.trackedSpacesCount} tracked spaces</span>
              </p>
              <p className="muted meta-inline">
                <span>role {connection.tokenRole ?? "unknown"}</span>
                <span>
                  validated{" "}
                  {connection.lastValidatedAt ? <LocalTimestamp value={connection.lastValidatedAt} /> : "never"}
                </span>
              </p>
            </div>
            {canManage ? (
              <button className="button button-ghost" type="button" onClick={() => syncConnection(connection.id)}>
                Sync now
              </button>
            ) : null}
          </article>
        ))}
        {connections.length === 0 ? (
          <div className="empty-state compact-empty">
            <h3>No connections yet.</h3>
          </div>
        ) : null}
      </div>

      <ConnectionOnboardingDialog
        open={isDialogOpen}
        dismissStorageKey={null}
        onClose={() => setIsDialogOpen(false)}
        title="Add connection"
        description=""
        dismissLabel="Close"
      />
    </section>
  );
}