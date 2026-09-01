<!-- markdownlint-disable MD041 first-line-heading/first-line-h1 -->

![UptimeMonitor logo: pixel art of an ECG-like monitor showing a heart](./docs/UptimeMonitor.png)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=ffffff)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=ffffff)](https://pnpm.io/)
[![vitest](https://img.shields.io/badge/vitest-6E9F18?logo=vitest&logoColor=ffffff)](https://vitest.dev/)
[![prek](https://img.shields.io/badge/prek-CC5A23?logo=prek&logoColor=FFFFFF)](https://github.com/j178/prek)
[![Biome](https://img.shields.io/badge/Biome-FFFFFF?logo=biome&logoColor=60A5FA)](https://github.com/biomejs/biome)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=ffffff)](https://workers.cloudflare.com/)

A serverless uptime monitoring tool, for deployment on Cloudflare Workers.

Simple interface showing health over last 12 hours and email alerts sent on state changes (down / recovered).

<!-- markdownlint-disable MD033 no-inline-html -->
<p align="center">
    <!-- markdownlint-disable-next-line MD013 line-length -->
    <img src="./docs/UptimeMonitor_screenshot.png" alt="UptimeMonitor screenshot showing latency graph and last fifteen heartbeats" width="500">
</p>
<!-- markdownlint-enable MD033 no-inline-html -->

## Prerequisites

- [pnpm](https://pnpm.io/) must be available locally.

## Quickstart

Run the worker locally using Wrangler via pnpm:

```sh
# only before first run, replace values in .env file as appropriate
cp src/.env.example src/.env

pnpm d1:local:init
pnpm d1:local:seed
pnpm dev
```

Navigate to `http://localhost:8787` to see UptimeMonitor working locally.

Manually trigger the scheduled heartbeat by navigating to: `http://localhost:8787/__scheduled?cron=*+*+*+*+*`

## Email alerts

UptimeMonitor is configured to send emails via Mailtrap out of the box.

Extend `sendAlertEmail` and set the `ALERT_PROVIDER` environment variable accordingly to add
support for other providers.

## Develop

- [prek](https://prek.j178.dev/) must be available locally to run pre-commit hooks.

### Run tests

Run tests locally with:

```sh
pnpm test
```

These also run in CI for every branch and merge commit.
