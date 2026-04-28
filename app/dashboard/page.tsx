import { DashboardLiveClient } from "@/components/dashboard-live-client";
import { getWorkspaceDashboard, getWorkspaceSummary } from "@/lib/app-data";
import { requireUserSession } from "@/lib/auth/session";

export default async function DashboardPage() {
  const session = await requireUserSession();

  const [dashboard, summary] = await Promise.all([
    getWorkspaceDashboard(session.user.workspaceId),
    getWorkspaceSummary(session.user.workspaceId),
  ]);

  return (
    <div className="stack-lg">
      <section className="summary-grid">
        <article className="panel summary-card">
          <p className="eyebrow">Connections</p>
          <strong className="summary-value">{summary.connectionsCount}</strong>
        </article>
        <article className="panel summary-card">
          <p className="eyebrow">Tracked Spaces</p>
          <strong className="summary-value">{summary.spacesCount}</strong>
        </article>
        <article className="panel summary-card">
          <p className="eyebrow">Active Jobs</p>
          <strong className="summary-value">{summary.jobsCount}</strong>
        </article>
      </section>

      <DashboardLiveClient initialSpaces={dashboard.spaces} initialJobs={dashboard.jobs} />
    </div>
  );
}