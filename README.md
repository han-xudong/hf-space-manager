# HF Space Manager

[![Build Distributions](https://github.com/han-xudong/hf-space-manager/actions/workflows/build-distributions.yml/badge.svg)](https://github.com/han-xudong/hf-space-manager/actions/workflows/build-distributions.yml)
[![Release](https://github.com/han-xudong/hf-space-manager/actions/workflows/release.yml/badge.svg)](https://github.com/han-xudong/hf-space-manager/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

HF Space Manager is a self-hosted control plane for Hugging Face Spaces. It provides a web dashboard for live Space status, secure Hugging Face token management, operational actions such as sync, rebuild, and restart, and local-first deployment through Docker or Electron.

## Features

- Live Space monitoring with manual sync, restart, rebuild, and wake actions
- Secure server-side Hugging Face token storage with an audit trail for state changes
- Background worker for queued jobs and scheduled anti-sleep wake-ups
- Self-hosted deployment through desktop builds, Docker, or local development mode

## Quick Start

### 1. Download a compiled release

If you want the fastest path, use a packaged desktop build from GitHub Releases:

1. Open [GitHub Releases](https://github.com/han-xudong/hf-space-manager/releases)
2. Download the asset for your platform
3. Extract it and launch HF Space Manager
4. Add a Hugging Face token from the Connections screen after first launch

### 2. Deploy with Docker

Create a local environment file first:

```bash
cp .env.example .env
```

Then replace at least these two values in `.env` before starting the stack:

- `APP_ENCRYPTION_KEY`
- `INTERNAL_EVENT_TOKEN`

Bring the app up with Docker Compose:

```bash
docker compose up --build
```

Open `http://localhost:3000` and complete setup from the Connections screen.

### 3. Run locally for development

Install dependencies:

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Generate fresh local values for these secrets instead of keeping the example placeholders:

```bash
openssl rand -base64 32
```

Initialize local data:

```bash
mkdir -p data
pnpm db:push
pnpm db:seed
```

Run the app:

```bash
pnpm dev
```

Open `http://localhost:3000` and add a Hugging Face token from the Connections screen.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
