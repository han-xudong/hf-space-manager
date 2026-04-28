import { getWorkspaceSummary } from "@/lib/app-data";
import { requireUserSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export default async function SettingsPage() {
  const session = await requireUserSession();
  const summary = await getWorkspaceSummary(session.user.workspaceId);

  return (
    <div className="stack-lg">
      <section className="summary-grid">
        <article className="panel summary-card">
          <p className="eyebrow">User</p>
          <strong className="summary-value">{session.user.name}</strong>
          <span className="muted">{session.user.email}</span>
        </article>
        <article className="panel summary-card">
          <p className="eyebrow">Connections</p>
          <strong className="summary-value">{summary.connectionsCount}</strong>
        </article>
        <article className="panel summary-card">
          <p className="eyebrow">Spaces</p>
          <strong className="summary-value">{summary.spacesCount}</strong>
        </article>
      </section>

      <section className="panel stack-lg">
        <div className="panel-header">
          <div>
            <h2>Settings</h2>
          </div>
        </div>

        <div className="settings-grid">
          <article className="list-card settings-card">
            <div>
              <p className="eyebrow">Scheduled sync interval</p>
              <h3>{env.HF_SYNC_INTERVAL_SECONDS}s</h3>
            </div>
            <span className="status-pill">sync</span>
          </article>

          <article className="list-card settings-card">
            <div>
              <p className="eyebrow">Schedule lookahead</p>
              <h3>{env.HF_WAKE_LOOKAHEAD_SECONDS}s</h3>
            </div>
            <span className="status-pill">schedule</span>
          </article>

          <article className="list-card settings-card">
            <div>
              <p className="eyebrow">Memberships</p>
              <h3>{summary.membersCount}</h3>
            </div>
            <span className="status-pill">users</span>
          </article>
        </div>
      </section>
    </div>
  );
}