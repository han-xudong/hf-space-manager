"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LocalTimestamp } from "@/components/local-timestamp";
import type { DashboardJob, DashboardSpace } from "@/lib/app-data";
import {
  formatActionStatusLabel,
  formatActionTypeLabel,
  formatSpaceStageLabel,
  getActionStatusTone,
  getSpaceStageTone,
} from "@/lib/presentation/status";

type Props = {
  initialSpaces: DashboardSpace[];
  initialJobs: DashboardJob[];
};

type StreamPayload = {
  spaces: DashboardSpace[];
  jobs: DashboardJob[];
};

export function DashboardLiveClient({
  initialSpaces,
  initialJobs,
}: Props) {
  const [spaces, setSpaces] = useState(initialSpaces);
  const [jobs, setJobs] = useState(initialJobs);
  const [isJobsOpen, setIsJobsOpen] = useState(initialJobs.length > 0);
  const [isClearing, setIsClearing] = useState(false);
  const [refreshingSpaceIds, setRefreshingSpaceIds] = useState<string[]>([]);
  const previousJobCount = useRef(initialJobs.length);
  const hasRequestedInitialSync = useRef(false);

  useEffect(() => {
    const source = new EventSource("/api/stream");

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamPayload;

      if (payload.jobs.length === 0) {
        setIsJobsOpen(false);
      } else if (payload.jobs.length > previousJobCount.current) {
        setIsJobsOpen(true);
      }

      previousJobCount.current = payload.jobs.length;
      setSpaces(payload.spaces);
      setJobs(payload.jobs);
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, []);

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === "PENDING" || job.status === "RUNNING"),
    [jobs],
  );

  const refreshAllSpaces = useCallback(async () => {
    setRefreshingSpaceIds((current) => {
      if (current.length > 0) {
        return current;
      }

      return spaces.map((space) => space.id);
    });

    try {
      const response = await fetch("/api/dashboard/sync", {
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as StreamPayload;
      previousJobCount.current = payload.jobs.length;
      setSpaces(payload.spaces);
      setJobs(payload.jobs);
    } finally {
      setRefreshingSpaceIds([]);
    }
  }, [spaces]);

  useEffect(() => {
    if (hasRequestedInitialSync.current) {
      return;
    }

    hasRequestedInitialSync.current = true;
    void refreshAllSpaces();
  }, [refreshAllSpaces]);

  async function clearJobs() {
    setIsClearing(true);

    try {
      const response = await fetch("/api/jobs", { method: "DELETE" });

      if (!response.ok) {
        return;
      }

      setJobs([]);
      setIsJobsOpen(false);
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="stack-lg">
      <section className="panel stack-md spaces-panel">
        <div className="panel-header">
          <div>
            <h2>Tracked Spaces</h2>
          </div>
        </div>

        <div className="space-list">
          {spaces.map((space) => {
            const isUpdating = refreshingSpaceIds.includes(space.id) || space.sync.isUpdating;
            const isQueued = !isUpdating && space.sync.isQueued;

            return (
              <Link className="space-list-item" href={space.detailPath} key={space.id}>
                <div className="space-list-header">
                  <div className="space-list-main">
                    <h3>{space.displayName}</h3>
                    {isUpdating ? (
                      <span className="sync-indicator" aria-live="polite">
                        <span className="sync-spinner" aria-hidden="true" />
                        Updating
                      </span>
                    ) : null}
                    {isQueued ? <span className="muted">Queued</span> : null}
                    {!isUpdating && space.sync.isDeadLetter ? <span className="error-text">sync dead letter</span> : null}
                  </div>
                  <span className={getSpaceStageTone(space.stage)}>{formatSpaceStageLabel(space.stage)}</span>
                </div>

                <div className="space-list-meta meta-inline muted">
                  <span>{space.sdk ?? "unknown sdk"}</span>
                  <span>{space.visibility}</span>
                  <span>{space.hardware ?? space.requestedHardware ?? "n/a"}</span>
                  <span>
                    last sync <LocalTimestamp value={space.lastSyncedAt} />
                  </span>
                  {space.actionSummary.pending > 0 ? <span>{space.actionSummary.pending} pending</span> : null}
                  {space.actionSummary.failed > 0 ? <span>{space.actionSummary.failed} failed</span> : null}
                </div>

                {!isUpdating && space.sync.lastError ? <p className="error-text">{space.sync.lastError}</p> : null}
              </Link>
            );
          })}
        </div>

        {spaces.length === 0 ? (
          <div className="empty-state">
            <h3>No tracked Spaces yet.</h3>
            <p className="muted">Add a connection first.</p>
          </div>
        ) : null}
      </section>

      <aside className={isJobsOpen ? "jobs-flyout is-open" : "jobs-flyout"}>
        <div className="jobs-flyout-header">
          <button
            className="jobs-flyout-trigger"
            type="button"
            onClick={() => setIsJobsOpen((current) => !current)}
          >
            <span>Recent jobs</span>
            <strong className="jobs-flyout-count">{activeJobs.length > 0 ? activeJobs.length : jobs.length}</strong>
          </button>

          <div className={isJobsOpen ? "jobs-flyout-actions is-open" : "jobs-flyout-actions"}>
            <button
              className="button button-ghost jobs-flyout-clear"
              type="button"
              disabled={jobs.length === 0 || isClearing}
              onClick={() => void clearJobs()}
            >
              Clear
            </button>

            <button
              className="button button-ghost jobs-flyout-arrow"
              type="button"
              aria-label={isJobsOpen ? "Collapse recent jobs" : "Expand recent jobs"}
              onClick={() => setIsJobsOpen((current) => !current)}
            >
              <span className="jobs-flyout-chevron" aria-hidden="true">
                {isJobsOpen ? "▾" : "▴"}
              </span>
            </button>
          </div>
        </div>

        <div className={isJobsOpen ? "jobs-flyout-panel is-open" : "jobs-flyout-panel"}>
          <div className="jobs-flyout-body stack-sm">
            {jobs.length === 0 ? <p className="muted">No jobs recorded yet.</p> : null}
            {jobs.map((job) => (
              <article className="list-card" key={job.id}>
                <div>
                  <h3>{job.displayName}</h3>
                  <p className="muted">
                    {formatActionTypeLabel(job.type)} · requested <LocalTimestamp value={job.requestedAt} />
                  </p>
                  {job.attemptCount > 0 ? (
                    <p className="muted">
                      attempt {job.attemptCount}
                      {job.status === "PENDING" ? (
                        <>
                          {" "}· next run <LocalTimestamp value={job.availableAt} />
                        </>
                      ) : null}
                      {job.status === "RUNNING" && job.workerId ? <> · {job.workerId}</> : null}
                      {job.isDeadLetter ? <> · dead letter</> : null}
                    </p>
                  ) : null}
                  {job.lastError ? <p className="error-text">{job.lastError}</p> : null}
                </div>
                <span className={getActionStatusTone(job.status)}>{formatActionStatusLabel(job.status)}</span>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}