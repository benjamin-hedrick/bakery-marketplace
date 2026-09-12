output "key_vault_id" {
  description = "Resource ID of the Key Vault instance"
  value       = azurerm_key_vault.kv.id
}

output "key_vault_uri" {
  description = "Vault URI of the Key Vault instance"
  value       = azurerm_key_vault.kv.vault_uri
}

output "key_vault_name" {
  description = "Name of the Key Vault instance"
  value       = azurerm_key_vault.kv.name
}
