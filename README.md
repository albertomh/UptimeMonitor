<!-- markdownlint-disable MD041 first-line-heading/first-line-h1 -->

![UptimeWorker logo: pixel art of an ECG-like monitor showing a heart](./docs/UptimeWorker.png)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=ffffff)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-FFFFFF?logo=pnpm&logoColor=000000)](https://pnpm.io/)
[![vitest](https://img.shields.io/badge/vitest-6E9F18?logo=vitest&logoColor=ffffff)](https://vitest.dev/)
[![prek](https://img.shields.io/badge/prek-CC5A23?logo=prek&logoColor=FFFFFF)](https://github.com/j178/prek)
[![Biome](https://img.shields.io/badge/Biome-FFFFFF?logo=biome&logoColor=60A5FA)](https://github.com/biomejs/biome)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F48120?logo=cloudflare&logoColor=ffffff)](https://workers.cloudflare.com/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-0C192B?logo=opentofu&logoColor=FFDA18)](https://opentofu.org/docs/)

A serverless uptime monitoring tool, for deployment on Cloudflare Workers.

Features:

- A simple web interface showing health over the last 12 hours
- Track multiple environments (test / live)
- Customisable cron expression: ping servers up to every minute
- Email alerts sent on state changes (down / recovered)
- An OpenTofu module to quickly deploy via IaC
- Geofence requests to the status page per country

<!-- markdownlint-disable MD033 no-inline-html -->
<p align="center">
    <!-- markdownlint-disable-next-line MD013 line-length -->
    <img src="./docs/UptimeWorker_screenshot.png" alt="UptimeWorker screenshot showing latency graph and last fifteen heartbeats" width="500">
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

Navigate to `http://localhost:8787` to see UptimeWorker running locally.

Manually trigger the scheduled heartbeat by navigating to: `http://localhost:8787/__scheduled?cron=*+*+*+*+*`

## Deploy

UptimeWorker is ready to be deployed via OpenTofu / Terraform:

```hcl
module "uptime_monitor" {
  source = "git::https://github.com/albertomh/UptimeWorker.git?ref=v1.0.0"
  ...
```

See full details of the Infrastructure-as-Code setup in [OPENTOFU.md](./docs/OPENTOFU.md)

## Email alerts

UptimeWorker is configured to send emails via Mailtrap out of the box.

Extend `sendAlertEmail` and set the `ALERT_PROVIDER` environment variable accordingly to add
support for other providers.

## Develop

- [prek](https://prek.j178.dev/) must be available locally to run pre-commit hooks.

### Run tests

Run tests locally with:

```sh
pnpm test
pnpm tofu:test
```

These also run in CI for every branch and merge commit.

## Motivation

A number of uptime monitors already exist. However, I faced the following
issues with those that I tried:

- Price. Some hosted offerings have free tiers, but these are not very generous
  or check sites so infrequently as to be useless.
- Complexity. Both paid & open-source tools over-extend themselves and 1) try
  to do too much 2) have too many settings to fiddle with.
- Maintenance burden. Most of the host-it-yourself projects require standing up
  a whole server (and looking after it). I wanted something serverless I could
  deploy and forget about.

---

## Acknowledgements

Wordmark typeset in [Jacquard 24](https://fonts.google.com/specimen/Jacquard+24).
