<!-- markdownlint-disable MD041 first-line-heading/first-line-h1 -->

![UptimeMonitor logo: pixel art of an ECG-like monitor showing a heart](./docs/UptimeMonitor.png)

A serverless uptime monitoring tool, for deployment on Cloudflare Workers.

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

<!-- markdownlint-disable MD033 no-inline-html -->
<p align="center">
    <!-- markdownlint-disable-next-line MD013 line-length -->
    <img src="./docs/UptimeMonitor_screenshot.png" alt="UptimeMonitor screenshot showing latency graph and last fifteen heartbeats" width="500">
</p>
<!-- markdownlint-enable MD033 no-inline-html -->

## Run tests

Run tests locally with:

```sh
pnpm test
```

These also run in CI for every branch and merge commit.

## Develop

- [prek](https://prek.j178.dev/) must be available locally to run pre-commit hooks.
