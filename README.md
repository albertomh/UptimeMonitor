# UptimeMonitor

A serverless uptime monitoring tool, for deployment on Cloudflare Workers.

## Prerequisites

- [pnpm](https://pnpm.io/) must be available locally.

## Local dev quickstart

Run the worker locally using Wrangler via pnpm:

```sh
pnpm d1:local:init
pnpm d1:local:seed
pnpm dev
```

Then test locally:

- `http://localhost:8787/`
- `http://localhost:8787/__scheduled?cron=*+*+*+*+*`
