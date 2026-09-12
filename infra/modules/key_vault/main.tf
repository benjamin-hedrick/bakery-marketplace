terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
  }
}

# Key Vault instance per environment (ADR-0007)
resource "azurerm_key_vault" "kv" {
  name                        = "kv-bakery-${var.environment}"
  location                    = var.location
  resource_group_name         = var.resource_group_name
  enabled_for_disk_encryption = true
  tenant_id                   = var.tenant_id
  soft_delete_retention_days  = 7
  purge_protection_enabled    = true
  enable_rbac_authorization   = true

  sku_name = "standard"

  tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# Role assignment: Key Vault Secrets User for Container App System-Assigned Managed Identities
resource "azurerm_role_assignment" "kv_secrets_user" {
  for_each             = var.service_principal_ids
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = each.value
}

# Cosmos DB Azure AD RBAC data-plane assignment (eliminating connection-string secrets per ADR-0007)
data "azurerm_cosmosdb_account" "cosmos" {
  count               = var.cosmos_account_name != "" ? 1 : 0
  name                = var.cosmos_account_name
  resource_group_name = var.resource_group_name
}

resource "azurerm_cosmosdb_sql_role_assignment" "cosmos_rbac" {
  for_each            = var.cosmos_account_name != "" ? var.service_principal_ids : {}
  resource_group_name = var.resource_group_name
  account_name        = data.azurerm_cosmosdb_account.cosmos[0].name
  # Built-in Cosmos DB Data Contributor role definition ID
  role_definition_id = "${data.azurerm_cosmosdb_account.cosmos[0].id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id        = each.value
  scope               = data.azurerm_cosmosdb_account.cosmos[0].id
}
