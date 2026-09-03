mock_provider "cloudflare" {}

variables {
  cloudflare_account_id      = "account-id"
  cloudflare_zone_id         = "zone-id"
  cloudflare_api_token       = "fake-cloudflare-token"
  project_name               = "demo"
  project_display_name       = "Demo"
  domain_name                = "example.com"
  frontend_allowed_countries = ["gb", "us"]
  alert_from_address         = "alerts@example.com"
  alert_to_addresses         = ["ops@example.com"]
  alert_api_key              = "fake-alert-token"

  targets = [
    {
      project_env = "live"
      url         = "https://example.com/-/health/"
      cron        = "* * * * *"
    },
  ]
}

run "disabled_module_creates_no_resources" {
  command = plan

  plan_options {
    refresh = false
  }

  variables {
    enabled = false
  }

  assert {
    condition     = length(cloudflare_d1_database.database) == 0
    error_message = "Disabled module should not create a D1 database."
  }

  assert {
    condition     = length(cloudflare_workers_script.worker) == 0
    error_message = "Disabled module should not create a Worker script."
  }

  assert {
    condition     = length(cloudflare_workers_cron_trigger.schedule) == 0
    error_message = "Disabled module should not create a cron trigger."
  }

  assert {
    condition     = length(cloudflare_workers_custom_domain.status) == 0
    error_message = "Disabled module should not create a status custom domain."
  }

  assert {
    condition     = output.status_hostname == null
    error_message = "Disabled module should not expose a status hostname."
  }
}

run "plans_expected_cloudflare_resources" {
  command = plan

  plan_options {
    refresh = false
  }

  assert {
    condition     = cloudflare_d1_database.database[0].account_id == "account-id"
    error_message = "D1 database should use the provided Cloudflare account ID."
  }

  assert {
    condition     = cloudflare_d1_database.database[0].name == "demo-uptime"
    error_message = "D1 database name should use the project uptime resource name."
  }

  assert {
    condition     = cloudflare_d1_database.database[0].read_replication.mode == "disabled"
    error_message = "D1 read replication must stay explicitly disabled."
  }

  assert {
    condition     = cloudflare_workers_script.worker[0].script_name == "demo-uptime"
    error_message = "Worker script name should use the project uptime resource name."
  }

  assert {
    condition     = cloudflare_workers_script.worker[0].content_file == "${path.module}/dist/index.js"
    error_message = "Worker script should deploy the bundled dist/index.js file."
  }

  assert {
    condition     = cloudflare_workers_script.worker[0].main_module == "index.js"
    error_message = "Worker script should use index.js as the module entrypoint."
  }

  assert {
    condition     = cloudflare_workers_cron_trigger.schedule[0].script_name == "demo-uptime"
    error_message = "Cron trigger should target the Worker script name."
  }

  assert {
    condition     = cloudflare_workers_custom_domain.status[0].hostname == "status.example.com"
    error_message = "Status custom domain should default to status.<domain_name>."
  }

  assert {
    condition     = cloudflare_workers_custom_domain.status[0].service == "demo-uptime"
    error_message = "Status custom domain should serve the Worker script."
  }

  assert {
    condition     = output.worker_script_name == "demo-uptime"
    error_message = "worker_script_name output should expose the Worker script name."
  }

  assert {
    condition     = output.d1_database_name == "demo-uptime"
    error_message = "d1_database_name output should expose the D1 database name."
  }

  assert {
    condition     = output.status_hostname == "status.example.com"
    error_message = "status_hostname output should use the default status subdomain."
  }
}

run "custom_status_subdomain_overrides_default" {
  command = plan

  plan_options {
    refresh = false
  }

  variables {
    status_subdomain = "health"
  }

  assert {
    condition     = cloudflare_workers_custom_domain.status[0].hostname == "health.example.com"
    error_message = "Status custom domain should use the configured status_subdomain."
  }

  assert {
    condition     = output.status_hostname == "health.example.com"
    error_message = "status_hostname output should use the configured status_subdomain."
  }
}
