<h1>HF Space Manager <img src="public/hfsm-logo.svg" alt="HFSM logo" width="30" /></h1>

[![Build Distributions](https://github.com/han-xudong/hf-space-manager/actions/workflows/build-distributions.yml/badge.svg)](https://github.com/han-xudong/hf-space-manager/actions/workflows/build-distributions.yml)
[![Release](https://github.com/han-xudong/hf-space-manager/actions/workflows/release.yml/badge.svg)](https://github.com/han-xudong/hf-space-manager/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

HF Space Manager is a self-hosted control plane for Hugging Face Spaces. It provides a web dashboard for live Space status, secure Hugging Face token management, operational actions such as sync, rebuild, and restart, and local-first deployment through Docker or Electron.

## Features

- Real-time dashboard updates over SSE
- Secure server-side Hugging Face token storage with encryption at rest
- Manual operations for sync, restart, rebuild, and wake
- Background worker for queued jobs and scheduled anti-sleep wake-ups
- Audit trail for state-changing actions
- Embedded SQLite runtime for straightforward self-hosting
- Docker deployment and Electron desktop distribution
- GitHub Actions release pipeline with GHCR publishing

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma + SQLite
- `@huggingface/hub`
- Electron
- Docker / Docker Compose

## Architecture

The runtime is split into three explicit layers:

- `web`: Next.js UI and API handlers
- `worker`: scheduled jobs, queue draining, and retries
- `sqlite`: durable state for users, connections, tracked spaces, jobs, and audit logs

Security defaults:

- Hugging Face tokens never reach the browser
- Hugging Face API calls are server-side only
- Tokens are encrypted before persistence
- State-changing actions are enforced and audited on the server

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create a local environment file

```bash
cp .env.example .env
```

Generate a 32-byte secret for `APP_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

### 3. Initialize local data

```bash
mkdir -p data
pnpm db:push
pnpm db:seed
```

### 4. Run the app

```bash
pnpm dev
```

Open `http://localhost:3000` and add a Hugging Face token from the Connections screen.

## Environment

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | SQLite database URL, for example `file:../data/hf-space-manager.db` |
| `APP_ENCRYPTION_KEY` | 32-byte server-side encryption key |
| `BOOTSTRAP_ADMIN_NAME` | Initial local operator name |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial local operator email |
| `HF_SYNC_INTERVAL_SECONDS` | Scheduled workspace sync interval |
| `HF_WAKE_LOOKAHEAD_SECONDS` | Wake policy evaluation lead time |
| `INTERNAL_WEB_BASE_URL` | Internal callback origin used by the worker |
| `INTERNAL_EVENT_TOKEN` | Shared secret for internal worker-to-web events |

Example local values:

```dotenv
DATABASE_URL="file:../data/hf-space-manager.db"
APP_ENCRYPTION_KEY="replace-with-a-base64-encoded-secret"
BOOTSTRAP_ADMIN_NAME="Admin"
BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
HF_SYNC_INTERVAL_SECONDS="60"
HF_WAKE_LOOKAHEAD_SECONDS="120"
INTERNAL_WEB_BASE_URL="http://127.0.0.1:3000"
INTERNAL_EVENT_TOKEN="replace-with-a-long-random-internal-token"
```

For Electron packaging, use the same variables or start from [electron/runtime-config.example.json](electron/runtime-config.example.json).

## Docker

Run the local containerized stack:

```bash
docker compose up --build
```

Build and run the single-image runtime manually:

```bash
pnpm build
pnpm start
```

The packaged runtime starts the standalone web server first, waits for `/api/health`, then starts the worker.

## Electron

Start the desktop host in development mode:

```bash
pnpm electron:dev
```

Create local distributable artifacts for the current platform:

```bash
pnpm electron:pack
```

## Release Workflow

The repository includes two GitHub Actions workflows:

- `Build Distributions`: validates Docker and Electron builds on pushes, pull requests, and manual runs
- `Release`: publishes Docker images to GHCR, builds Electron release assets, creates source archives, and attaches everything to a GitHub Release

### Tag Rules

- Stable tags such as `v1.2.3` publish versioned image tags and `latest`
- Pre-release tags such as `v1.2.3-beta.1` publish versioned image tags only
- Manual release runs follow the same rule: pre-release tags never publish `latest`

### Docker Publish Target

Release images are published to:

```text
ghcr.io/<owner>/hf-space-manager
```

### Release Assets

Each GitHub Release includes:

- Electron distributables for supported platforms
- Source archives in `.tar.gz` and `.zip`
- A Docker OCI archive
- A JSON manifest containing pushed GHCR tags and the image digest

### Typical Release Commands

Stable release:

```bash
git tag v1.2.3
git push origin v1.2.3
```

Pre-release:

```bash
git tag v1.2.3-beta.1
git push origin v1.2.3-beta.1
```

## Commands

```bash
pnpm dev
pnpm dev:web
pnpm dev:worker
pnpm build
pnpm start
pnpm start:web
pnpm worker
pnpm electron:dev
pnpm electron:smoke
pnpm electron:pack
pnpm electron:pack:dir
pnpm lint
pnpm db:push
pnpm db:seed
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
