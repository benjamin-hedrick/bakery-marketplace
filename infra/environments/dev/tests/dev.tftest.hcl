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
  tenant_id                 = "00000000-0000-0000-0000-000000000001"
  registry_login_server     = "bakerytest01.azurecr.io"
  app_identity_id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-bakery-foundation/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-bakery-dev-apps"
  app_identity_principal_id = "00000000-0000-0000-0000-000000000002"
  deploy_principal_id       = "00000000-0000-0000-0000-000000000003"
  key_vault_name            = "kv-bakery-dev-test1"
  cosmos_account_name       = "cosmos-bakery-dev-test1"
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
    condition     = length(azurerm_key_vault_secret.placeholder) == 3
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

  assert {
    condition     = azurerm_cosmosdb_sql_container.vendor_orders.name == "vendor-orders" && azurerm_cosmosdb_sql_container.vendor_orders.partition_key_paths[0] == "/vendorId"
    error_message = "The vendor order read model container must be vendor-orders, partitioned by /vendorId (N-03)."
  }

  assert {
    condition     = azurerm_cosmosdb_sql_container.preferences.name == "preferences" && azurerm_cosmosdb_sql_container.preferences.partition_key_paths[0] == "/customerId" && azurerm_cosmosdb_sql_container.preferences.default_ttl == null
    error_message = "The allergen profiles must be in their own container, preferences, partitioned by /customerId, with no expiry (WI-PREF-001)."
  }

  assert {
    condition     = azurerm_cosmosdb_sql_container.payment_methods.name == "payment-methods" && azurerm_cosmosdb_sql_container.payment_methods.partition_key_paths[0] == "/customerId" && azurerm_cosmosdb_sql_container.payment_methods.default_ttl == null
    error_message = "The saved payment methods must be in their own container, payment-methods, partitioned by /customerId, with no expiry (WI-ORD-010): EnsureCreated is off in the cloud, so a missing container breaks checkout."
  }

  assert {
    condition     = azurerm_cosmosdb_sql_container.catalog.default_ttl == -1 && azurerm_cosmosdb_sql_container.orders.default_ttl == null
    error_message = "The catalog container needs default_ttl = -1 so released stock reservations expire (register item 66); orders must never expire."
  }
}

run "the_web_app_keeps_its_sessions_in_an_internal_noeviction_redis_with_its_key_from_the_vault" {
  command = plan

  assert {
    condition = (
      azurerm_container_app.redis_sessions.ingress[0].external_enabled == false
      && azurerm_container_app.redis_sessions.ingress[0].exposed_port != azurerm_container_app.redis.ingress[0].exposed_port
      && azurerm_container_app.redis_sessions.ingress[0].exposed_port != azurerm_container_app.redis_cache.ingress[0].exposed_port
    )
    error_message = "The sessions Redis must be internal and must not share the event Redis's or the cache Redis's exposed port (ADR-0019)."
  }

  assert {
    condition     = contains(azurerm_container_app.redis_sessions.template[0].container[0].args, "noeviction") && !contains(azurerm_container_app.redis_sessions.template[0].container[0].args, "allkeys-lru")
    error_message = "The sessions Redis must use maxmemory-policy noeviction: a full store refuses new logins instead of silently ending existing ones (register item 118)."
  }

  assert {
    condition     = contains(azurerm_container_app.redis_cache.template[0].container[0].args, "allkeys-lru")
    error_message = "The cache Redis stays an evicting cache (ADR-0002); sessions do not live in it (register item 118)."
  }

  assert {
    condition     = local.apps["catalog"].env["Cache__Backend"] == "redis" && local.apps["catalog"].env["Cache__Redis__ConnectionString"] == "redis-cache:${azurerm_container_app.redis_cache.ingress[0].exposed_port}"
    error_message = "The catalog must use the cache Redis (ADR-0002) at the address and port the cache app exposes; a cache app that no service uses is wasted cost."
  }

  assert {
    condition     = contains(keys(local.apps["web"].secrets), "session-encryption-key") && local.apps["web"].secrets["session-encryption-key"] == "SESSION_ENCRYPTION_KEY"
    error_message = "The web app's session encryption key must come from the Key Vault as SESSION_ENCRYPTION_KEY, never as a literal value (ADR-0007, ADR-0019)."
  }

  assert {
    condition     = local.apps["web"].env["SESSION_REDIS_URL"] == "redis://redis-sessions:6381" && contains(keys(local.apps["web"].env), "APP_ORIGIN")
    error_message = "The web app needs its own origin and the cache Redis address to run the login on its server."
  }

  assert {
    condition     = local.apps["web"].env["TRUSTED_PROXY_HOPS"] == "1"
    error_message = "The web app sits behind the Container Apps ingress, one proxy: TRUSTED_PROXY_HOPS must be 1, or every visitor shares the ingress's address and one rate limit (WI-RATE-001)."
  }

  assert {
    condition     = !contains(keys(local.apps["web"].env), "SESSION_ALLOW_MEMORY_STORE") && local.apps["web"].env["SESSION_REDIS_URL"] != "memory"
    error_message = "The deployed web app must never be set to keep sessions in its own memory (SESSION_ALLOW_MEMORY_STORE, SESSION_REDIS_URL=memory): they would be lost on restart and not shared between instances (register item 122)."
  }
}

run "the_dotnet_services_run_as_this_environments_host_environment_and_the_mock_issuer_stays_production" {
  command = plan

  # The apps' addresses are derived from the environment's default domain, which is only known after apply; give it a value so the env lists can be read.
  override_resource {
    target          = azurerm_container_app_environment.env
    override_during = plan
    values = {
      id             = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-bakery-dev/providers/Microsoft.App/managedEnvironments/cae-bakery-dev"
      default_domain = "test.example.io"
    }
  }

  assert {
    condition = alltrue([
      for k in ["catalog", "ordering"] :
      length([for e in azurerm_container_app.apps[k].template[0].container[0].env : e if e.name == "ASPNETCORE_ENVIRONMENT" && e.value == "Development"]) == 1
    ])
    error_message = "Dev runs the .NET services as Development (var.host_environment, decided 2026-11-09)."
  }
  assert {
    condition = alltrue([
      for k in ["catalog", "ordering"] :
      length([for e in azurerm_container_app.apps[k].template[0].container[0].env : e if e.name == "Deployment__Environment" && e.value == "dev"]) == 1
    ])
    error_message = "The services are told which environment this is (ADR-0024 reads it)."
  }
  assert {
    condition = alltrue([
      for k in ["catalog", "ordering"] :
      length([for e in azurerm_container_app.apps[k].template[0].container[0].env : e if e.name == "Cosmos__GatewayMode" && e.value == "false"]) == 1
    ])
    error_message = "appsettings.Development.json turns the emulator's gateway mode on; the deployed environment must keep direct mode."
  }
  assert {
    condition     = length([for e in azurerm_container_app.mock[0].template[0].container[0].env : e if e.name == "ASPNETCORE_ENVIRONMENT" && e.value == "Production"]) == 1
    error_message = "The mock issuer must stay Production: that is what makes it enforce MockOidcDeployment."
  }
  assert {
    condition     = length([for e in azurerm_container_app.apps["bff"].template[0].container[0].env : e if e.name == "DEPLOYMENT_ENVIRONMENT" && e.value == "dev"]) == 1
    error_message = "The BFF is told which environment this is (the Node gate for chaos scenarios reads it, ADR-0024)."
  }
  assert {
    condition     = alltrue([for k in ["catalog", "ordering", "bff", "web"] : length([for e in azurerm_container_app.apps[k].template[0].container[0].env : e if startswith(e.name, "CHAOS_") || startswith(e.name, "Chaos__")]) == 0])
    error_message = "No app may have a chaos setting switched on by Terraform: a scenario is enabled by configuration when someone chooses to run one."
  }
}

run "a_production_host_environment_can_be_set_per_environment" {
  command = plan

  # The apps' addresses are derived from the environment's default domain, which is only known after apply; give it a value so the env lists can be read.
  override_resource {
    target          = azurerm_container_app_environment.env
    override_during = plan
    values = {
      id             = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-bakery-dev/providers/Microsoft.App/managedEnvironments/cae-bakery-dev"
      default_domain = "test.example.io"
    }
  }

  variables {
    host_environment = "Production"
  }

  assert {
    condition     = length([for e in azurerm_container_app.apps["catalog"].template[0].container[0].env : e if e.name == "ASPNETCORE_ENVIRONMENT" && e.value == "Production"]) == 1
    error_message = "The host environment comes from the variable."
  }
}

run "an_unknown_host_environment_is_refused" {
  command = plan

  variables {
    host_environment = "Staging2"
  }

  expect_failures = [var.host_environment]
}

run "a_plain_http_issuer_address_is_refused" {
  command = plan

  variables {
    issuer_mode                 = "entra"
    auth_authority              = "http://issuer.example.test"
    service_auth_token_endpoint = "https://issuer.example.test/token"
    web_auth_issuer             = "https://issuer.example.test"
  }

  expect_failures = [var.auth_authority]
}
