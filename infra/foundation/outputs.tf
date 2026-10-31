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

output "app_identities" {
  description = "Per environment: the container apps identity (resource id for the apps, principal id for role assignments in the environment stack)."
  value = {
    for k, v in azurerm_user_assigned_identity.apps : k => {
      id           = v.id
      principal_id = v.principal_id
      client_id    = v.client_id
    }
  }
}
