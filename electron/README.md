# Electron Runtime Notes

This directory defines the runtime contract for packaging HF Space Manager inside an Electron host process.

The packaged app still runs the same two local processes:

- `web`: Next.js standalone server
- `worker`: background scheduler and queue runner

The repository now includes a minimal Electron host scaffold at [main.mjs](./main.mjs) plus a preload bridge at [preload.mjs](./preload.mjs).

For cross-process realtime updates, the worker calls back into the local web runtime through:

- `POST /api/internal/workspace-updates`

## Required Runtime Values

The Electron host should materialize these environment variables before spawning the packaged `web` and `worker` child processes:

- `PORT`
- `DATABASE_URL`
- `APP_ENCRYPTION_KEY`
- `BOOTSTRAP_ADMIN_NAME`
- `BOOTSTRAP_ADMIN_EMAIL`
- `HF_SYNC_INTERVAL_SECONDS`
- `HF_WAKE_LOOKAHEAD_SECONDS`
- `INTERNAL_WEB_BASE_URL`
- `INTERNAL_EVENT_TOKEN`

You can optionally point the host at a JSON config file by setting `HFSM_ELECTRON_CONFIG` before launch.

## Expected Wiring

- `PORT` should be a localhost-only port chosen by the Electron host.
- `INTERNAL_WEB_BASE_URL` should point to that same local origin, for example `http://127.0.0.1:3838`.
- `INTERNAL_EVENT_TOKEN` should be generated once per local installation and stored alongside other local app secrets.
- `DATABASE_URL` should point to a writable database file under the Electron user-data directory.

## Suggested Local Layout

```text
<userData>/hf-space-manager/
  data/
    hf-space-manager.db
  secrets/
    internal-event-token
    app-encryption-key
  logs/
```

## Config Template

See [runtime-config.example.json](./runtime-config.example.json) for a template the Electron host can translate into process environment variables.

## Local Commands

- `pnpm electron:dev` starts the Electron host against the local packaged runtime contract
- `pnpm electron:smoke` starts the host in hidden-window mode and exits automatically after a health-backed smoke pass
