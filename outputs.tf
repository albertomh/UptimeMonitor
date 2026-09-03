output "worker_script_name" {
  description = "Name of the Cloudflare Worker script."
  value       = try(cloudflare_workers_script.worker[0].script_name, null)
}

output "d1_database_id" {
  description = "ID of the D1 database used by the Worker."
  value       = try(cloudflare_d1_database.database[0].id, null)
}

output "d1_database_name" {
  description = "Name of the D1 database used by the Worker."
  value       = try(cloudflare_d1_database.database[0].name, null)
}

output "status_hostname" {
  description = "Hostname where the status dashboard is routed."
  value       = var.enabled ? "${var.status_subdomain}.${var.domain_name}" : null
}
