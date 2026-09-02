variable "enabled" {
  type        = bool
  description = <<-EOT
    Whether to create the monitor's resources. The uptime monitor is a single
    global deployment, so callers managing multiple OpenTofu workspaces should
    pass `terraform.workspace == "default"` (or similar) to keep it in one
    workspace only.
  EOT
  default     = true
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the Worker, D1 database, and custom domain."
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID for the domain the status page is served on."
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token used to bootstrap the D1 schema."
}

variable "project_name" {
  type        = string
  description = "Slug used to name the Worker script and D1 database (e.g. \"foo\" yields \"foo-uptime\")."
}

variable "project_display_name" {
  type        = string
  description = "Human-readable project name shown on the dashboard and in alert emails (PROJECT_DISPLAY_NAME binding)."
}

variable "domain_name" {
  type        = string
  description = "Zone domain the status page is served under; combined with status_subdomain to form the hostname."
}

variable "status_subdomain" {
  type        = string
  description = "Subdomain label for the status page hostname (default yields status.<domain_name>)."
  default     = "status"
}

variable "targets" {
  description = "Monitoring targets, serialised to the TARGETS_JSON Worker binding. Each target's cron controls how often the Worker checks it."
  type = list(object({
    project_env = string
    url         = string
    cron        = string
  }))
}

variable "frontend_allowed_countries" {
  type        = list(string)
  description = "Two-letter country codes allowed to access the status dashboard."
}

variable "cron_schedules" {
  type        = list(string)
  description = "Cron expressions that fire the Worker's scheduled handler. The Worker decides which targets to check per invocation, so this only needs to be as frequent as the tightest target cadence."
  default     = ["* * * * *"]
}

variable "alert_provider" {
  type        = string
  description = "Alert transport. Only \"mailtrap\" is currently implemented by the Worker."
  default     = "mailtrap"

  validation {
    condition     = var.alert_provider == "mailtrap"
    error_message = "alert_provider must be \"mailtrap\" (the only provider the Worker supports)."
  }
}

variable "alert_from_address" {
  type        = string
  description = "Verified sender address for alert emails (ALERT_FROM binding)."
}

variable "alert_to_addresses" {
  type        = list(string)
  description = "Recipient addresses for alert emails (ALERT_TO_ADDRESSES binding)."
}

variable "alert_api_key" {
  type        = string
  sensitive   = true
  description = "API key for the alert provider (ALERT_API_KEY secret binding)."
}
