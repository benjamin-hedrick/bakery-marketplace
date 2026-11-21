# The module's outputs under the names the pipeline and the scripts already use.
output "web_url" {
  description = "The address of the web app; the post-deploy smoke runs against it."
  value       = module.environment.web_url
}

output "key_vault_name" {
  value = module.environment.key_vault_name
}

output "cosmos_account_name" {
  value = module.environment.cosmos_account_name
}

output "secret_names" {
  description = "Key Vault secrets Terraform creates with a placeholder; the post-apply step sets the real values."
  value       = module.environment.secret_names
}

output "issuer_url" {
  description = "The token issuer in use (the mock issuer's public address in mock mode)."
  value       = module.environment.issuer_url
}
