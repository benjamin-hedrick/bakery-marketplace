# Plan-level tests of the foundation stack with a mocked provider: no Azure account, no credentials, no network. They check what the code asks
# Azure for, not that Azure accepts it (that needs a real plan and apply). Run: node scripts/ci/terraform-checks.mjs

mock_provider "azurerm" {}

variables {
  registry_name = "bakerytest01"
}

run "a_basic_registry_with_no_admin_user_and_no_budget_by_default" {
  command = plan

  assert {
    condition     = azurerm_container_registry.acr.sku == "Basic"
    error_message = "The registry should be the Basic SKU."
  }
  assert {
    condition     = azurerm_container_registry.acr.admin_enabled == false
    error_message = "The registry admin user (a shared password) must stay off."
  }
  assert {
    condition     = azurerm_resource_group.foundation.name == "rg-bakery-foundation"
    error_message = "Unexpected resource group name."
  }
  assert {
    condition     = length(azurerm_consumption_budget_resource_group.foundation) == 0
    error_message = "With no contact emails there should be no budget."
  }
  assert {
    condition     = length(azurerm_role_assignment.acr_push) == 0 && length(azurerm_role_assignment.acr_pull) == 0
    error_message = "No role assignments without principals."
  }
}

run "every_resource_is_tagged_as_persistent_foundation" {
  command = plan

  variables {
    tags = { Owner = "lead" }
  }

  assert {
    condition     = azurerm_resource_group.foundation.tags["Stack"] == "foundation" && azurerm_resource_group.foundation.tags["Lifetime"] == "persistent" && azurerm_resource_group.foundation.tags["Owner"] == "lead"
    error_message = "The resource group should carry the stack, lifetime and extra tags."
  }
  assert {
    condition     = azurerm_container_registry.acr.tags["ManagedBy"] == "Terraform"
    error_message = "The registry should be tagged as managed by Terraform."
  }
}

run "push_and_pull_are_separate_roles_one_assignment_per_principal" {
  command = plan

  variables {
    acr_push_principals = { pipeline = "00000000-0000-0000-0000-0000000000a1" }
    acr_pull_principals = { dev-web = "00000000-0000-0000-0000-0000000000b1", dev-bff = "00000000-0000-0000-0000-0000000000b2" }
  }

  assert {
    condition     = azurerm_role_assignment.acr_push["pipeline"].role_definition_name == "AcrPush"
    error_message = "The pipeline identity should get AcrPush."
  }
  assert {
    condition     = length(azurerm_role_assignment.acr_pull) == 2 && alltrue([for a in azurerm_role_assignment.acr_pull : a.role_definition_name == "AcrPull"])
    error_message = "Each pulling identity should get AcrPull, and nothing broader."
  }
}

run "a_budget_with_two_notifications_when_there_are_contacts" {
  command = plan

  variables {
    budget_contact_emails = ["lead@example.test"]
    budget_amount         = 12
  }

  assert {
    condition     = length(azurerm_consumption_budget_resource_group.foundation) == 1 && azurerm_consumption_budget_resource_group.foundation[0].amount == 12
    error_message = "A budget of the requested amount should exist."
  }
  assert {
    condition     = length(azurerm_consumption_budget_resource_group.foundation[0].notification) == 2
    error_message = "The budget should notify at 80 percent actual and 100 percent forecast."
  }
}

run "a_registry_name_with_a_hyphen_is_refused" {
  command = plan

  variables {
    registry_name = "bakery-mkt"
  }

  expect_failures = [var.registry_name]
}

run "a_budget_start_that_is_not_the_first_of_a_month_is_refused" {
  command = plan

  variables {
    budget_start_date = "2026-11-15T00:00:00Z"
  }

  expect_failures = [var.budget_start_date]
}

run "an_environment_identity_gets_acrpull_on_the_registry_and_stays_persistent" {
  command = plan

  variables {
    app_identities = ["dev"]
  }

  assert {
    condition     = azurerm_user_assigned_identity.apps["dev"].name == "id-bakery-dev-apps"
    error_message = "Unexpected identity name."
  }
  assert {
    condition     = azurerm_role_assignment.acr_pull_apps["dev"].role_definition_name == "AcrPull"
    error_message = "The apps identity should get AcrPull and nothing more."
  }
  assert {
    condition     = azurerm_user_assigned_identity.apps["dev"].tags["Lifetime"] == "persistent"
    error_message = "The identity must carry the persistent tag so the destroy guard refuses to delete it."
  }
}
