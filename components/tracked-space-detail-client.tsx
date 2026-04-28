"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { LocalTimestamp } from "@/components/local-timestamp";
import type { TrackedSpaceDetail } from "@/lib/app-data";
import {
  formatActionStatusLabel,
  formatActionTypeLabel,
  formatSpaceStageLabel,
  getActionStatusTone,
  getSpaceStageTone,
} from "@/lib/presentation/status";

type Props = {
  space: TrackedSpaceDetail;
  canOperate: boolean;
  canManageSchedules: boolean;
};

function clampIntervalMinutes(value: number) {
  return Math.min(1440, Math.max(30, value));
}

function formatIntervalLabel(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  if (minutes % 60 === 0) {
    return `${minutes / 60} hr`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} hr ${remainder} min`;
}

export function TrackedSpaceDetailClient({ space, canOperate, canManageSchedules }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRequestingSync, setIsRequestingSync] = useState(false);
  const [spaceState, setSpaceState] = useState(space);
  const [intervalMinutes, setIntervalMinutes] = useState(
    clampIntervalMinutes(space.wakePolicy?.intervalMinutes ?? 30),
  );
  const initialSyncSpaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setSpaceState(space);
      setIntervalMinutes(clampIntervalMinutes(space.wakePolicy?.intervalMinutes ?? 30));
    });
  }, [space, startTransition]);

  useEffect(() => {
    if (initialSyncSpaceIdRef.current === space.id) {
      return;
    }

    initialSyncSpaceIdRef.current = space.id;
    let cancelled = false;

    const requestInitialSync = async () => {
      setIsRequestingSync(true);

      try {
        const response = await fetch(`/api/spaces/${space.id}/sync`, {
          method: "POST",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { space?: TrackedSpaceDetail | null };

        if (!cancelled && payload.space) {
          setSpaceState(payload.space);
          setIntervalMinutes(clampIntervalMinutes(payload.space.wakePolicy?.intervalMinutes ?? 30));
        }
      } finally {
        if (!cancelled) {
          setIsRequestingSync(false);
        }
      }
    };

    void requestInitialSync();

    return () => {
      cancelled = true;
    };
  }, [space.id]);

  useEffect(() => {
    if (spaceState.sync.status !== "PENDING" && spaceState.sync.status !== "RUNNING") {
      return;
    }

    let cancelled = false;

    const refreshSpaceState = async () => {
      const response = await fetch(`/api/spaces/${space.id}/sync`);

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { space?: TrackedSpaceDetail | null };

      if (!cancelled && payload.space) {
        setSpaceState(payload.space);
        setIntervalMinutes(clampIntervalMinutes(payload.space.wakePolicy?.intervalMinutes ?? 30));
      }
    };

    void refreshSpaceState();

    const timer = window.setInterval(() => {
      void refreshSpaceState();
    }, 3_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [space.id, spaceState.sync.status]);

  async function submitAction(type: "RESTART" | "REBUILD") {
    setError(null);

    const response = await fetch(`/api/spaces/${spaceState.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Action failed." }));
      setError(body.error ?? "Action failed.");
      return;
    }

    startTransition(() => router.refresh());
  }

  async function saveSchedule(formData: FormData) {
    setError(null);

    const nextIntervalMinutes = clampIntervalMinutes(Number(formData.get("intervalMinutes") ?? intervalMinutes));
    const previousIntervalMinutes = clampIntervalMinutes(spaceState.wakePolicy?.intervalMinutes ?? 30);
    setIntervalMinutes(nextIntervalMinutes);

    const response = await fetch(`/api/spaces/${spaceState.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: formData.get("enabled") === "on",
        intervalMinutes: nextIntervalMinutes,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Failed to update schedule." }));
      setIntervalMinutes(previousIntervalMinutes);
      setError(body.error ?? "Failed to update schedule.");
      return;
    }

    startTransition(() => router.refresh());
  }

  async function clearJobs() {
    setError(null);

    const response = await fetch(`/api/spaces/${spaceState.id}/jobs`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Failed to clear jobs." }));
      setError(body.error ?? "Failed to clear jobs.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="stack-lg">
      <div className="detail-toolbar">
        <Link href="/dashboard" className="button button-ghost">
          Back to dashboard
        </Link>

        {canOperate ? (
          <div className="detail-toolbar-actions">
            <button className="button button-ghost" disabled={isPending} onClick={() => submitAction("RESTART")}>
              Restart
            </button>
            <button className="button button-danger" disabled={isPending} onClick={() => submitAction("REBUILD")}>
              Rebuild
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="panel stack-md">
        <div className="space-card-header">
          <div>
            <div className="space-title-row">
              <h2>{spaceState.displayName}</h2>
              {spaceState.sync.isUpdating || isRequestingSync ? (
                <span className="sync-indicator" aria-live="polite">
                  <span className="sync-spinner" aria-hidden="true" />
                  Updating
                </span>
              ) : null}
              {!spaceState.sync.isUpdating && !isRequestingSync && spaceState.sync.isQueued ? <span className="muted">Queued</span> : null}
            </div>
            <div className="meta-inline muted">
              <span>{spaceState.sdk ?? "unknown sdk"}</span>
              <span>{spaceState.visibility}</span>
              {!spaceState.sync.isUpdating && !isRequestingSync && spaceState.sync.isDeadLetter ? <span className="error-text">sync dead letter</span> : null}
            </div>
          </div>
          <span className={getSpaceStageTone(spaceState.stage)}>{formatSpaceStageLabel(spaceState.stage)}</span>
        </div>

        {spaceState.sync.lastError && !spaceState.sync.isUpdating && !isRequestingSync ? <p className="error-text">{spaceState.sync.lastError}</p> : null}

        <div className="detail-meta-grid">
          <div className="metric-tile">
            <span className="muted">hardware</span>
            <strong>{spaceState.hardware ?? "n/a"}</strong>
          </div>
          <div className="metric-tile">
            <span className="muted">requested</span>
            <strong>{spaceState.requestedHardware ?? "n/a"}</strong>
          </div>
          <div className="metric-tile">
            <span className="muted">sleep time</span>
            <strong>{spaceState.sleepTimeSeconds ? `${spaceState.sleepTimeSeconds}s` : "default"}</strong>
          </div>
          <div className="metric-tile">
            <span className="muted">last sync</span>
            <strong>
              <LocalTimestamp value={spaceState.lastSyncedAt} />
            </strong>
          </div>
          <div className="metric-tile">
            <span className="muted">last wake</span>
            <strong>
              <LocalTimestamp value={spaceState.lastWakeAt} />
            </strong>
          </div>
        </div>
      </section>

      {canManageSchedules ? (
        <section className="panel stack-md">
          <div className="panel-header">
            <div>
              <h2>Wake schedule</h2>
            </div>
          </div>

          <form action={saveSchedule} className="detail-schedule-form">
            <label className="field-inline">
              <input name="enabled" type="checkbox" defaultChecked={spaceState.wakePolicy?.enabled ?? false} />
              <span>Keep awake</span>
            </label>

            <label className="slider-field">
              <div className="slider-field-header">
                <span>Wake interval</span>
                <strong>{formatIntervalLabel(intervalMinutes)}</strong>
              </div>
              <input
                name="intervalMinutes"
                type="range"
                min={30}
                max={1440}
                step={30}
                value={intervalMinutes}
                onChange={(event) => setIntervalMinutes(clampIntervalMinutes(Number(event.target.value)))}
              />
              <div className="range-labels muted">
                <span>30 min</span>
                <span>24 hr</span>
              </div>
            </label>

            <p className="muted">
              Next run <LocalTimestamp value={spaceState.wakePolicy?.nextRunAt ?? null} />
            </p>

            <button className="button button-ghost" type="submit" disabled={isPending}>
              Save schedule
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel stack-md">
        <div className="panel-header">
          <div>
            <h2>Recent jobs</h2>
          </div>

          <button className="button button-ghost" type="button" disabled={spaceState.jobs.length === 0 || isPending} onClick={() => void clearJobs()}>
            Clear
          </button>
        </div>

        <div className="stack-sm">
          {spaceState.jobs.length === 0 ? <p className="muted">No jobs recorded yet.</p> : null}
          {spaceState.jobs.map((job) => (
            <article className="list-card" key={job.id}>
              <div>
                <h3>{formatActionTypeLabel(job.type)}</h3>
                <p className="muted">
                  requested <LocalTimestamp value={job.requestedAt} />
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
      </section>
    </div>
  );
}