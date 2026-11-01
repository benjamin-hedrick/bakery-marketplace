# Plan-level tests of the mock issuer app and its guards (register item 102), mocked providers, no Azure access.

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
  tenant_id                 = "00000000-0000-0000-0000-000000000001"
  registry_login_server     = "bakerytest01.azurecr.io"
  app_identity_id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-bakery-foundation/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-bakery-dev-apps"
  app_identity_principal_id = "00000000-0000-0000-0000-000000000002"
  deploy_principal_id       = "00000000-0000-0000-0000-000000000003"
  key_vault_name            = "kv-bakery-dev-test1"
  cosmos_account_name       = "cosmos-bakery-dev-test1"
}

run "by_default_the_mock_issuer_is_public_and_lets_only_customers_in" {
  command = plan

  assert {
    condition     = length(azurerm_container_app.mock) == 1 && azurerm_container_app.mock[0].ingress[0].external_enabled == true
    error_message = "The browser logs in at the mock issuer, so it needs external ingress."
  }
  assert {
    condition = alltrue([
      for e in azurerm_container_app.mock[0].template[0].container[0].env :
      e.name != "MockOidc__AllowedRoles__0" || e.value == "Customer"
    ]) && length([for e in azurerm_container_app.mock[0].template[0].container[0].env : e if startswith(e.name, "MockOidc__AllowedRoles__")]) == 1
    error_message = "Only the Customer role may log in by default."
  }
  assert {
    condition     = length([for e in azurerm_container_app.mock[0].template[0].container[0].env : e if e.name == "MockOidc__IngressRestricted" && e.value == "false"]) == 1
    error_message = "With no allow-list the host must be told the ingress is NOT restricted."
  }
}

run "an_admin_login_without_an_allow_list_is_refused_at_plan_time" {
  command = plan

  variables {
    issuer_roles = ["Customer", "Admin"]
  }

  expect_failures = [azurerm_container_app.mock]
}

run "an_admin_login_with_an_allow_list_is_planned_and_the_host_is_told" {
  command = plan

  variables {
    issuer_roles = ["Customer", "Admin"]
    allowed_ips  = ["203.0.113.7/32"]
  }

  assert {
    condition     = length([for e in azurerm_container_app.mock[0].template[0].container[0].env : e if e.name == "MockOidc__IngressRestricted" && e.value == "true"]) == 1
    error_message = "The host must be told the ingress is restricted."
  }
  assert {
    condition     = length(azurerm_container_app.mock[0].ingress[0].ip_security_restriction) == 1 && length(azurerm_container_app.apps["web"].ingress[0].ip_security_restriction) == 1
    error_message = "The allow-list must apply to both the mock issuer and the web app."
  }
}

run "entra_mode_has_no_mock_issuer_and_uses_the_given_addresses" {
  command = plan

  variables {
    issuer_mode                 = "entra"
    auth_authority              = "https://issuer.example.test"
    service_auth_token_endpoint = "https://issuer.example.test/token"
    web_auth_issuer             = "https://issuer.example.test"
  }

  assert {
    condition     = length(azurerm_container_app.mock) == 0
    error_message = "No mock issuer in Entra mode."
  }
  assert {
    condition     = output.issuer_url == "https://issuer.example.test"
    error_message = "Entra mode uses the configured authority."
  }
}
