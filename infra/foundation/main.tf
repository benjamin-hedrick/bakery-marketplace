# The foundation stack (ADR-0020): what outlives the disposable environments. Today that is the container registry, so tearing down an environment
# does not delete the images. It is created once by a person, then changed through the pipeline's infrastructure stage, and it is never destroyed
# by the environment teardown (the destroy guard refuses any plan that touches it, scripts/ci/destroy-guard.mjs).

locals {
  tags = merge(var.tags, {
    ManagedBy = "Terraform"
    Stack     = "foundation"
    Lifetime  = "persistent"
  })
}

resource "azurerm_resource_group" "foundation" {
  name     = "rg-${var.name_prefix}-foundation"
  location = var.location
  tags     = local.tags
}

# Basic is enough for one small registry. Admin user off: nothing pulls or pushes with a registry password, only identities do (ADR-0007).
# Basic has no private link and no retention policy; old untagged images stay until a cleanup step removes them (not built).
resource "azurerm_container_registry" "acr" {
  name                = var.registry_name
  resource_group_name = azurerm_resource_group.foundation.name
  location            = azurerm_resource_group.foundation.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = local.tags
}

resource "azurerm_role_assignment" "acr_push" {
  for_each             = var.acr_push_principals
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPush"
  principal_id         = each.value
}

resource "azurerm_role_assignment" "acr_pull" {
  for_each             = var.acr_pull_principals
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = each.value
}

# A notification only. It cannot stop or delete anything; teardown stays a person's approved run.
resource "azurerm_consumption_budget_resource_group" "foundation" {
  count             = length(var.budget_contact_emails) > 0 ? 1 : 0
  name              = "budget-${var.name_prefix}-foundation"
  resource_group_id = azurerm_resource_group.foundation.id
  amount            = var.budget_amount
  time_grain        = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = var.budget_contact_emails
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Forecasted"
    contact_emails = var.budget_contact_emails
  }
}
