# Plan-level tests of the dev environment stack with a mocked provider: no Azure account, no credentials, no network. They check what the code
# asks Azure for, not that Azure accepts it. Run: node scripts/ci/terraform-checks.mjs --roots infra/foundation,infra/environments/dev

mock_provider "azurerm" {
  mock_data "azurerm_resource_group" {
    defaults = {
      name     = "rg-bakery-dev"
      location = "eastus"
    }
  }
}
mock_provider "time" {}

variables {
  tenant_id                   = "00000000-0000-0000-0000-000000000001"
  registry_login_server       = "bakerytest01.azurecr.io"
  app_identity_id             = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-bakery-foundation/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-bakery-dev-apps"
  app_identity_principal_id   = "00000000-0000-0000-0000-000000000002"
  deploy_principal_id         = "00000000-0000-0000-0000-000000000003"
  key_vault_name              = "kv-bakery-dev-test1"
  cosmos_account_name         = "cosmos-bakery-dev-test1"
  auth_authority              = "https://issuer.example.test"
  service_auth_token_endpoint = "https://issuer.example.test/token"
  web_auth_issuer             = "https://issuer.example.test"
}

run "only_the_web_app_is_reachable_from_outside" {
  command = plan

  assert {
    condition     = azurerm_container_app.apps["web"].ingress[0].external_enabled == true
    error_message = "The web app must have external ingress."
  }
  assert {
    condition     = alltrue([for k in ["catalog", "ordering", "bff"] : azurerm_container_app.apps[k].ingress[0].external_enabled == false])
    error_message = "The services and the BFF must be internal only."
  }
  assert {
    condition     = azurerm_container_app.redis.ingress[0].external_enabled == false
    error_message = "Redis must never be reachable from outside the environment."
  }
}

run "no_secret_value_is_in_the_configuration" {
  command = plan

  assert {
    condition     = alltrue([for s in azurerm_key_vault_secret.placeholder : nonsensitive(s.value) == "set-after-apply"])
    error_message = "Key Vault secrets must be created with the placeholder only; real values are set after apply (ADR-0020, decision 4)."
  }
  assert {
    condition     = length(azurerm_key_vault_secret.placeholder) == 2
    error_message = "Expected the Cosmos connection string and the ordering client secret."
  }
}

run "the_registry_pull_and_vault_reads_use_the_persistent_identity" {
  command = plan

  assert {
    condition     = alltrue([for a in azurerm_container_app.apps : a.registry[0].server == "bakerytest01.azurecr.io"])
    error_message = "Every app pulls from the foundation registry."
  }
  assert {
    condition     = azurerm_role_assignment.kv_secrets_user_apps.role_definition_name == "Key Vault Secrets User"
    error_message = "The apps identity may only read secrets."
  }
}

run "the_environment_is_tagged_disposable" {
  command = plan

  assert {
    condition     = azurerm_key_vault.kv.tags["Lifetime"] == "disposable" && azurerm_cosmosdb_account.cosmos.tags["Stack"] == "environment"
    error_message = "Resources here must carry the disposable environment tags (the destroy guard refuses persistent ones)."
  }
}

run "the_cosmos_containers_match_what_the_services_expect" {
  command = plan

  assert {
    condition     = azurerm_cosmosdb_sql_container.catalog.partition_key_paths[0] == "/vendorId" && azurerm_cosmosdb_sql_container.orders.partition_key_paths[0] == "/customerId"
    error_message = "Partition keys must match the service code (catalog /vendorId, orders /customerId)."
  }
}
