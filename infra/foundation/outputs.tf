output "resource_group_name" {
  description = "The foundation resource group."
  value       = azurerm_resource_group.foundation.name
}

output "registry_id" {
  description = "The registry's resource id (what the environment stacks grant AcrPull on)."
  value       = azurerm_container_registry.acr.id
}

output "registry_login_server" {
  description = "The registry's address, e.g. bakerymkt123.azurecr.io (the prefix of every image name)."
  value       = azurerm_container_registry.acr.login_server
}
