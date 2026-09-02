locals {
  resource_name              = "${var.project_name}-uptime"
  status_hostname            = "${var.status_subdomain}.${var.domain_name}"
  frontend_allowed_countries = join(",", [for country in var.frontend_allowed_countries : upper(country)])
  schema_path                = "${path.module}/src/db/schema.sql"
  schema_sql                 = file(local.schema_path)
}

resource "cloudflare_d1_database" "this" {
  count = var.enabled ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = local.resource_name

  read_replication = {
    mode = "disabled"
  }
}

resource "terraform_data" "schema" {
  count = var.enabled ? 1 : 0

  triggers_replace = [
    cloudflare_d1_database.this[0].id,
    filesha256(local.schema_path),
  ]

  provisioner "local-exec" {
    environment = {
      CLOUDFLARE_API_TOKEN = var.cloudflare_api_token
    }

    interpreter = ["/bin/sh", "-c"]
    command     = <<EOT
set -eu

if [ -z "$${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "CLOUDFLARE_API_TOKEN must be set to apply the D1 schema." >&2
  exit 1
fi

payload="$$(mktemp)"
trap 'rm -f "$${payload}"' EXIT

cat > "$${payload}" <<'JSON'
${jsonencode({ sql = local.schema_sql })}
JSON

curl -fsS \
  -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/d1/database/${cloudflare_d1_database.this[0].id}/query" \
  -H "Authorization: Bearer $${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "@$${payload}" \
  >/dev/null
EOT
  }
}

resource "cloudflare_workers_script" "this" {
  count = var.enabled ? 1 : 0

  account_id         = var.cloudflare_account_id
  script_name        = local.resource_name
  compatibility_date = "2024-04-01"
  content_file       = "${path.module}/dist/index.js"
  content_sha256     = filesha256("${path.module}/dist/index.js")
  main_module        = "index.js"

  bindings = [
    {
      name        = "DB"
      type        = "d1"
      database_id = cloudflare_d1_database.this[0].id
    },
    {
      name = "PROJECT_DISPLAY_NAME"
      type = "plain_text"
      text = var.project_display_name
    },
    {
      name = "TARGETS_JSON"
      type = "plain_text"
      text = jsonencode(var.targets)
    },
    {
      name = "FRONTEND_ALLOWED_COUNTRIES"
      type = "plain_text"
      text = local.frontend_allowed_countries
    },
    {
      name = "ALERT_PROVIDER"
      type = "plain_text"
      text = var.alert_provider
    },
    {
      name = "ALERT_FROM"
      type = "plain_text"
      text = var.alert_from_address
    },
    {
      name = "ALERT_TO_ADDRESSES"
      type = "plain_text"
      text = jsonencode(var.alert_to_addresses)
    },
    {
      name = "ALERT_API_KEY"
      type = "secret_text"
      text = var.alert_api_key
    },
  ]
}

resource "cloudflare_workers_cron_trigger" "this" {
  count = var.enabled ? 1 : 0

  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.this[0].script_name

  # Cloudflare API limitation: cron triggers are create/update only and cannot
  # be deleted via Terraform. A destroy can leave orphaned schedules behind in
  # Cloudflare; clean them up manually via API or the dashboard.
  schedules = [for expr in var.cron_schedules : { cron = expr }]

  depends_on = [terraform_data.schema]
}

resource "cloudflare_workers_route" "this" {
  count = var.enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
  pattern = "${local.status_hostname}/*"
  script  = cloudflare_workers_script.this[0].id
}
