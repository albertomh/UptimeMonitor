# UptimeWorker OpenTofu Module

This module deploys UptimeWorker to Cloudflare:

- a D1 database for heartbeat history
- the bundled Worker script from `dist/index.js`
- Worker bindings for targets, dashboard geofencing, and Mailtrap alerts
- a scheduled Worker cron trigger
- a Workers route for `status_subdomain.domain_name`
- a D1 schema bootstrap step using Cloudflare's D1 query API

## Usage

```hcl
module "uptime_monitor" {
  source = "git::https://github.com/albertomh/UptimeWorker.git?ref=v1.0.0"

  # Global resource - deploy from a single workspace only.
  enabled = terraform.workspace == "default"

  cloudflare_account_id = var.cloudflare_account_id
  cloudflare_zone_id    = var.cloudflare_zone_id
  cloudflare_api_token  = var.cloudflare_api_token

  project_name         = "myproject"
  project_display_name = "MyProject"
  domain_name          = "example.com"

  targets = [
    {
      project_env = "live"
      url         = "https://example.com/-/health/"
      cron        = "* * * * *"
    },
  ]

  frontend_allowed_countries = ["GB", "US"]

  alert_from_address = "alerts@example.com"
  alert_to_addresses = ["recipient@example.com"]
  alert_api_key      = var.mailtrap_api_key
}
```

Configure the Cloudflare provider in the calling project. The module reuses
`cloudflare_api_token` for the schema bootstrap step.

```hcl
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
```

## Notes

Cloudflare cron triggers are create/update only in the API. `tofu destroy` can
leave orphaned schedules behind; remove them manually in Cloudflare if you
destroy this module.
