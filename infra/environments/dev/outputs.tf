output "web_url" {
  description = "The address of the web app; the post-deploy smoke runs against it."
  value       = "https://${azurerm_container_app.apps["web"].ingress[0].fqdn}"
}

output "key_vault_name" {
  value = azurerm_key_vault.kv.name
}

output "cosmos_account_name" {
  value = azurerm_cosmosdb_account.cosmos.name
}

output "secret_names" {
  description = "Key Vault secrets Terraform creates with a placeholder; the post-apply step sets the real values (cosmos-connection-string from the account's key; ordering-client-secret from the issuer)."
  value       = [for s in azurerm_key_vault_secret.placeholder : s.name]
}
