# Plan-level tests of the environment module with UAT's values (infra/environments/uat/main.tf; WI-DEP-002 step 5) and a mocked provider: no Azure
# account, no credentials, no network. They check what the code asks Azure for, not that Azure accepts it.

mock_provider "azurerm" {
  mock_data "azurerm_resource_group" {
    defaults = {
      id       = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-bakery-uat"
      name     = "rg-bakery-uat"
      location = "eastus2"
    }
  }
}
mock_provider "time" {}

# The apps' addresses are derived from the environment's default domain, which is only known after apply; give it a value so the env lists can be read.
override_resource {
  target          = azurerm_container_app_environment.env
  override_during = plan
  values = {
    id             = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-bakery-uat/providers/Microsoft.App/managedEnvironments/cae-bakery-uat"
    default_domain = "test.example.io"
  }
}

variables {
  tenant_id                 = "00000000-0000-0000-0000-000000000001"
  registry_login_server     = "bakerytest01.azurecr.io"
  app_identity_id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-bakery-foundation/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-bakery-uat-apps"
  app_identity_principal_id = "00000000-0000-0000-0000-000000000002"
  deploy_principal_id       = "00000000-0000-0000-0000-000000000003"
  key_vault_name            = "kv-bakery-uat-test1"
  cosmos_account_name       = "cosmos-bakery-uat-test1"
  # What the UAT root sets.
  environment         = "uat"
  resource_group_name = "rg-bakery-uat"
  host_environment    = "Production"
  cosmos_free_tier    = false
  cosmos_location     = "eastus2"
}

run "uat_runs_the_services_as_production_in_its_own_group_and_region_with_no_free_tier" {
  command = plan

  assert {
    condition = alltrue([for k in ["catalog", "ordering"] : length([
      for e in azurerm_container_app.apps[k].template[0].container[0].env : e if e.name == "ASPNETCORE_ENVIRONMENT" && e.value == "Production"
    ]) == 1])
    error_message = "UAT runs the services as Production (decided 2026-11-21)."
  }
  assert {
    condition     = azurerm_container_app_environment.env.location == "eastus2" && azurerm_container_app_environment.env.name == "cae-bakery-uat"
    error_message = "UAT's Container Apps environment is in its group's region, East US 2 (one environment per region on this subscription, register 229)."
  }
  assert {
    condition     = azurerm_cosmosdb_account.cosmos.free_tier_enabled == false && azurerm_cosmosdb_account.cosmos.location == "eastus2"
    error_message = "UAT's Cosmos account is not on the free tier (the subscription's one free-tier account is dev's)."
  }
}

run "uat_names_itself_uat_everywhere_and_has_no_chaos_setting" {
  command = plan

  assert {
    condition = alltrue([for k in ["catalog", "ordering"] : length([
      for e in azurerm_container_app.apps[k].template[0].container[0].env : e if e.name == "Deployment__Environment" && e.value == "uat"
    ]) == 1])
    error_message = "The services are told the environment is uat."
  }
  assert {
    condition = (
      length([for e in azurerm_container_app_job.seed.template[0].container[0].env : e if e.name == "Deployment__Environment" && e.value == "uat"]) == 1
      && length([for e in azurerm_container_app.mock[0].template[0].container[0].env : e if e.name == "Deployment__Environment" && e.value == "uat"]) == 1
    )
    error_message = "The seed job and the mock issuer are told the environment is uat, which their guards accept (WI-DEP-002 step 4)."
  }
  assert {
    condition = alltrue([for k in ["catalog", "ordering", "bff", "web"] : length([
      for e in azurerm_container_app.apps[k].template[0].container[0].env : e if startswith(e.name, "Chaos__") || startswith(e.name, "CHAOS_")
    ]) == 0])
    error_message = "UAT never runs chaos (ADR-0024)."
  }
}

run "uat_cannot_run_as_development" {
  command = plan

  variables {
    host_environment = "Development"
  }

  expect_failures = [var.host_environment]
}
