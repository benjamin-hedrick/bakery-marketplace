# One disposable application environment (ADR-0020): every environment root (infra/environments/dev, later uat) calls this module with its own
# values, so the environments run the same code (decision 9; WI-DEP-002 step 2a moved it here from the dev root, with moved blocks there). It works
# inside the resource group the bootstrap created and never creates or deletes that group; teardown empties it. Everything here is destroyed by the
# manual destroy run (scripts/ci/destroy-guard.mjs checks the plan first). Persistent things (registry, the apps identities and their AcrPull)
# live in infra/foundation.
#
# Checked with mocked providers (node scripts/ci/terraform-checks.mjs: tests/ here).
# Planned against Azure (2026-11-20, locally and in the dev pipeline); the first apply created part of it and stopped (Redis args, Cosmos region).
# What was and was not verified: docs/evidence/WI-DEP-001/.

data "azurerm_resource_group" "env" {
  name = var.resource_group_name
}

locals {
  rg       = data.azurerm_resource_group.env.name
  location = data.azurerm_resource_group.env.location
  tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Stack       = "environment"
    Lifetime    = "disposable"
  })

  # Secrets whose real value never passes through Terraform, its state or a plan (ADR-0020 decision 4 and its note of 2026-11-20).
  # Terraform creates each with a placeholder through the write-only value_wo, which is never stored and never read back, so the real value a
  # pipeline step sets later with "az keyvault secret set" stays out of the state. Other secrets do reach the state (the Cosmos account's keys,
  # the Log Analytics shared keys): docs/architecture/secrets-and-sensitive-values.md.
  placeholder_secrets = toset(["cosmos-connection-string", "ordering-client-secret", "session-encryption-key"])
  placeholder_value   = "set-after-apply"

  # Addresses are known before anything is created: an app's public name is <app>.<environment default domain>. In mock mode the issuer
  # addresses are derived from the mock issuer app, so there is nothing to type and no chicken-and-egg with the first apply.
  domain         = azurerm_container_app_environment.env.default_domain
  mock_url       = "https://mock-oidc.${local.domain}"
  web_url        = "https://web.${local.domain}"
  use_mock       = var.issuer_mode == "mock"
  authority      = local.use_mock ? local.mock_url : var.auth_authority
  token_endpoint = local.use_mock ? "${local.mock_url}/token" : var.service_auth_token_endpoint
  web_issuer     = local.use_mock ? local.mock_url : var.web_auth_issuer

  # Inside the Container Apps environment an app with ingress answers on its name (http://catalog) on port 80.
  # The host environment is a per-environment variable (var.host_environment; dev runs as Development, 2026-11-09). Two things Development brings
  # with it are pinned here: appsettings.Development.json would otherwise switch Cosmos to the emulator's gateway mode, and the services accept
  # plain-http token metadata in Development, which the https validations on the issuer variables guard against.
  # Deployment__Environment names the environment itself; chaos scenarios (ADR-0024) read it. It is always var.environment, and only the dev root
  # passes environment = "dev" (scripts/ci/tests/chaos-not-deployed.test.mjs).
  # The chaos scenario (WI-CHAOS-006): with one named, every app starts with it, each through the settings its own library reads; with none, no app
  # has a chaos setting at all. var.chaos_scenario refuses a scenario outside dev.
  chaos_on     = var.chaos_scenario != "none"
  dotnet_chaos = local.chaos_on ? { Chaos__Enabled = "true", Chaos__Scenario = var.chaos_scenario } : {}
  node_chaos   = local.chaos_on ? { CHAOS_ENABLED = "true", CHAOS_SCENARIO = var.chaos_scenario } : {}

  # The listing cache (ADR-0002, WI-CAT-003): the cache Redis below when the environment has it, otherwise the catalog's in-process cache
  # (var.cache_redis, register 216 option d). With the cache Redis unreachable the catalog serves from its in-process fallback anyway.
  catalog_cache = var.cache_redis ? {
    Cache__Backend                 = "redis"
    Cache__Redis__ConnectionString = "redis-cache:6380"
  } : { Cache__Backend = "local" }

  dotnet_env = {
    ASPNETCORE_ENVIRONMENT  = var.host_environment
    Deployment__Environment = var.environment
    Cosmos__GatewayMode     = "false"
    Auth__Authority         = local.authority
    Auth__Audience          = var.auth_audience
    Auth__MetadataAddress   = var.auth_metadata_address
    Data__Backend           = "cosmos"
    Events__Backend         = "redis"
    Redis__ConnectionString = "redis-events:6379"
    Cosmos__Database        = "bakery"
    Cosmos__EnsureCreated   = "false"
  }

  # Key is the Terraform key, name is the app's name. External ingress only for the web app.
  apps = {
    catalog = {
      name     = "catalog"
      port     = 5200
      external = false
      env      = merge(local.dotnet_env, local.dotnet_chaos, local.catalog_cache)
      secrets  = { "cosmos-connection-string" = "Cosmos__ConnectionString" }
    }
    ordering = {
      name     = "ordering"
      port     = 5300
      external = false
      env = merge(local.dotnet_env, local.dotnet_chaos, {
        Catalog__BaseUrl           = "http://catalog"
        ServiceAuth__TokenEndpoint = local.token_endpoint
        ServiceAuth__ClientId      = var.service_auth_client_id
        ServiceAuth__Scope         = var.service_auth_scope
      })
      secrets = {
        "cosmos-connection-string" = "Cosmos__ConnectionString"
        "ordering-client-secret"   = "ServiceAuth__ClientSecret"
      }
    }
    bff = {
      name     = "graphql-bff"
      port     = 4100
      external = false
      env = merge(local.node_chaos, {
        CATALOG_URL  = "http://catalog"
        ORDERING_URL = "http://ordering"
        # Names the environment for chaos scenarios (ADR-0024): the image sets NODE_ENV=production everywhere, so this is what allows a scenario here.
        DEPLOYMENT_ENVIRONMENT = var.environment
      })
      secrets = {}
    }
    web = {
      name     = "web"
      port     = 3000
      external = true
      env = merge(local.node_chaos, {
        GRAPHQL_URL    = "http://graphql-bff/graphql"
        AUTH_ISSUER    = local.web_issuer
        AUTH_CLIENT_ID = var.web_auth_client_id
        # The login happens on the app's server (ADR-0019): its own origin, and the sessions Redis for the session store (sessions are encrypted with
        # the key below). In mock mode the server reaches the issuer at the same public address the browser uses.
        APP_ORIGIN        = local.web_url
        SESSION_REDIS_URL = "redis://redis-sessions:6381"
        # The Container Apps ingress is one proxy in front of the app and appends the visitor's address to X-Forwarded-For. With 0 the rate limits would
        # count every visitor by the ingress's address and share one login limit between all of them (docs/operations/local-dev.md, TRUSTED_PROXY_HOPS).
        TRUSTED_PROXY_HOPS = "1"
        # Names the environment for chaos scenarios (ADR-0024, WI-CHAOS-006), as for the BFF: without it a web or session layer would refuse to start.
        DEPLOYMENT_ENVIRONMENT = var.environment
      })
      secrets = { "session-encryption-key" = "SESSION_ENCRYPTION_KEY" }
    }
  }
}

# ---- Budget alert on the environment's resource group (the foundation has its own) ----------------------------------------------------
# The environment is created after the month starts, and a new budget cannot start in a past month, so the start is the first day of the month
# the budget is created in, fixed at creation (time_static) so later plans do not move it. It is destroyed with the environment.
resource "time_static" "budget_created" {
  count = length(var.budget_contact_emails) > 0 ? 1 : 0
}

resource "azurerm_consumption_budget_resource_group" "env" {
  count             = length(var.budget_contact_emails) > 0 ? 1 : 0
  name              = "budget-${var.name_prefix}-${var.environment}"
  resource_group_id = data.azurerm_resource_group.env.id
  amount            = var.budget_amount
  time_grain        = "Monthly"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", time_static.budget_created[0].rfc3339)
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

resource "azurerm_log_analytics_workspace" "logs" {
  name                = "log-${var.name_prefix}-${var.environment}"
  resource_group_name = local.rg
  location            = local.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.5 # a cap on cost; ingestion stops for the day above it
  tags                = local.tags
}

resource "azurerm_container_app_environment" "env" {
  name                       = "cae-${var.name_prefix}-${var.environment}"
  resource_group_name        = local.rg
  location                   = local.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  tags                       = local.tags

  # Azure gives a new environment a "Consumption" workload profile even when none is asked for, and the provider does not record it at create
  # (first apply, 2026-11-20). Declaring it would make a plan from the state REPLACE the environment; leaving it undeclared makes a refreshed
  # plan try to remove it. So it is ignored. It is billed like the consumption-only plan.
  lifecycle {
    ignore_changes = [workload_profile]
  }

  # The provider's default create limit is 30 minutes. On 2026-11-20 Azure accepted the create and left the environment "Waiting" for over
  # 77 minutes; the apply stopped at 30 with the environment in Azure but not in the state (register 227). 45 minutes allows a slow create
  # and still ends inside the apply job's 60-minute limit (Azure DevOps' default, not set in the pipeline), so Terraform stops on its own
  # and releases the state lock instead of being killed with the lock held. It does not help an environment that never finishes.
  timeouts {
    create = "45m"
  }
}

# ---- Key Vault: holds the secrets the apps read by reference ---------------------------------------------------------------------------
resource "azurerm_key_vault" "kv" {
  name                          = var.key_vault_name
  resource_group_name           = local.rg
  location                      = local.location
  tenant_id                     = var.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  soft_delete_retention_days    = 7
  purge_protection_enabled      = false # dev is disposable; with protection on, a rebuilt environment could not reuse the name for the retention period
  public_network_access_enabled = true
  tags                          = local.tags
}

resource "azurerm_role_assignment" "kv_secrets_user_apps" {
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = var.app_identity_principal_id
}

resource "azurerm_role_assignment" "kv_secrets_officer_deploy" {
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.deploy_principal_id
}

# Role assignments take a while to take effect; creating a secret straight after can fail with 403.
resource "time_sleep" "kv_roles" {
  create_duration = "90s"
  depends_on      = [azurerm_role_assignment.kv_secrets_officer_deploy, azurerm_role_assignment.kv_secrets_user_apps]
}

resource "azurerm_key_vault_secret" "placeholder" {
  for_each     = local.placeholder_secrets
  name         = each.key
  key_vault_id = azurerm_key_vault.kv.id
  tags         = local.tags
  depends_on   = [time_sleep.kv_roles]

  # Write-only: sent on create, never stored in state or a plan, never compared. Raising the version would overwrite the real value with the
  # placeholder, so it stays 1.
  value_wo         = local.placeholder_value
  value_wo_version = 1

  lifecycle {
    ignore_changes = [tags]
  }
}

# ---- Cosmos DB: the account, one database, the containers the services expect (DATA-004) -------------------------------------------
resource "azurerm_cosmosdb_account" "cosmos" {
  name                = var.cosmos_account_name
  resource_group_name = local.rg
  location            = var.cosmos_location # not local.location: see the variable; the apps reach it over the public endpoint either way
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  free_tier_enabled   = var.cosmos_free_tier

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = var.cosmos_location
    failover_priority = 0
  }

  tags = local.tags
}

resource "azurerm_cosmosdb_sql_database" "bakery" {
  name                = "bakery"
  resource_group_name = local.rg
  account_name        = azurerm_cosmosdb_account.cosmos.name
  throughput          = 400 # shared by the containers; inside the free tier's 1000 RU/s
}

resource "azurerm_cosmosdb_sql_container" "catalog" {
  name                  = "catalog"
  resource_group_name   = local.rg
  account_name          = azurerm_cosmosdb_account.cosmos.name
  database_name         = azurerm_cosmosdb_sql_database.bakery.name
  partition_key_paths   = ["/vendorId"]
  partition_key_version = 2
  # -1 turns time to live on without expiring anything by default: only a document that carries its own ttl expires, and only released
  # stock reservations do (register item 66). Listings and vendor status documents never expire.
  default_ttl = -1
}

resource "azurerm_cosmosdb_sql_container" "orders" {
  name                  = "orders"
  resource_group_name   = local.rg
  account_name          = azurerm_cosmosdb_account.cosmos.name
  database_name         = azurerm_cosmosdb_sql_database.bakery.name
  partition_key_paths   = ["/customerId"]
  partition_key_version = 2
}

# The vendor order read model (N-03): one summary per order, kept up to date from the order events. Rebuildable from the orders, so it
# holds nothing that is not also in `orders`. Partitioned by vendor so a vendor's list is one partition.
resource "azurerm_cosmosdb_sql_container" "vendor_orders" {
  name                  = "vendor-orders"
  resource_group_name   = local.rg
  account_name          = azurerm_cosmosdb_account.cosmos.name
  database_name         = azurerm_cosmosdb_sql_database.bakery.name
  partition_key_paths   = ["/vendorId"]
  partition_key_version = 2
}

# Customers' allergen profiles (WI-PREF-001, ADR-0004): quasi-health data (NFR 3.7), so its own container with one partition per customer, never
# shared with listings or orders.
resource "azurerm_cosmosdb_sql_container" "preferences" {
  name                  = "preferences"
  resource_group_name   = local.rg
  account_name          = azurerm_cosmosdb_account.cosmos.name
  database_name         = azurerm_cosmosdb_sql_database.bakery.name
  partition_key_paths   = ["/customerId"]
  partition_key_version = 2
}

# Customers' saved payment methods (WI-ORD-010): ordering owns them and reads them at checkout, one partition per customer. The documents hold an
# opaque token (ADR-0005, ADR-0007), so this container is never shared with orders. With Cosmos__EnsureCreated off here, the container must exist
# before the first checkout.
resource "azurerm_cosmosdb_sql_container" "payment_methods" {
  name                  = "payment-methods"
  resource_group_name   = local.rg
  account_name          = azurerm_cosmosdb_account.cosmos.name
  database_name         = azurerm_cosmosdb_sql_database.bakery.name
  partition_key_paths   = ["/customerId"]
  partition_key_version = 2
}

# ---- The apps ---------------------------------------------------------------------------------------------------------------------------
# Redis for the event backbone: internal only, no persistence, torn down with the environment.
resource "azurerm_container_app" "redis" {
  name                         = "redis-events"
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption" # what Azure assigns anyway (see the environment); unset, every plan would try to remove it
  tags                         = local.tags

  ingress {
    external_enabled = false
    transport        = "tcp"
    target_port      = 6379
    exposed_port     = 6379

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1 # the event stream lives in memory; scaling to zero would lose it
    max_replicas = 1

    container {
      name   = "redis"
      image  = "docker.io/library/redis:7.4-alpine"
      cpu    = 0.25
      memory = "0.5Gi"
      # A bare --save turns snapshots off (Redis 7). Never pass an empty string here: the provider fails reading it back (first apply, 2026-11-20).
      args = ["redis-server", "--save", "--appendonly", "no"]
    }
  }
}

# The cache Redis (ADR-0002): internal only, no persistence, a separate instance from the event Redis so eviction can never touch the event streams.
# It is on its own TCP port because two TCP apps in one environment cannot share an exposed port. A full cache evicts the least recently used
# keys; sessions are NOT kept here (they are in redis-sessions below, register item 118). Left out when var.cache_redis is false (dev only, register
# 216): adding the count moves the existing app to redis_cache[0] in the state, with no change in Azure.
resource "azurerm_container_app" "redis_cache" {
  count                        = var.cache_redis ? 1 : 0
  name                         = "redis-cache"
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption" # what Azure assigns anyway (see the environment); unset, every plan would try to remove it
  tags                         = local.tags

  ingress {
    external_enabled = false
    transport        = "tcp"
    target_port      = 6379
    exposed_port     = 6380

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1 # a cache that scaled to zero would start cold on every wake-up; it holds nothing that cannot be rebuilt
    max_replicas = 1

    container {
      name   = "redis"
      image  = "docker.io/library/redis:7.4-alpine"
      cpu    = 0.25
      memory = "0.5Gi"
      args   = ["redis-server", "--save", "--appendonly", "no", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
    }
  }
}

# The web app's browser sessions (ADR-0019, register item 118): a separate instance because the eviction policy is per instance. noeviction means a
# full store refuses new logins loudly instead of dropping the oldest sessions and logging those users out. Internal only, no persistence, its own
# TCP port (two TCP apps in one environment cannot share an exposed port).
resource "azurerm_container_app" "redis_sessions" {
  name                         = "redis-sessions"
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption" # what Azure assigns anyway (see the environment); unset, every plan would try to remove it
  tags                         = local.tags

  ingress {
    external_enabled = false
    transport        = "tcp"
    target_port      = 6379
    exposed_port     = 6381

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1 # sessions live in memory; scaling to zero would log everyone out
    max_replicas = 1

    container {
      name   = "redis"
      image  = "docker.io/library/redis:7.4-alpine"
      cpu    = 0.25
      memory = "0.5Gi"
      args   = ["redis-server", "--save", "--appendonly", "no", "--maxmemory", "128mb", "--maxmemory-policy", "noeviction"]
    }
  }
}

resource "azurerm_container_app" "apps" {
  for_each                     = local.apps
  name                         = each.value.name
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption" # what Azure assigns anyway (see the environment); unset, every plan would try to remove it
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.app_identity_id]
  }

  registry {
    server   = var.registry_login_server
    identity = var.app_identity_id
  }

  dynamic "secret" {
    for_each = each.value.secrets
    content {
      name                = secret.key
      identity            = var.app_identity_id
      key_vault_secret_id = azurerm_key_vault_secret.placeholder[secret.key].versionless_id
    }
  }

  ingress {
    external_enabled = each.value.external
    target_port      = each.value.port
    transport        = "http"

    dynamic "ip_security_restriction" {
      for_each = each.value.external ? var.allowed_ips : []
      content {
        name             = "allow-${replace(replace(ip_security_restriction.value, ".", "-"), "/", "-")}"
        action           = "Allow"
        ip_address_range = ip_security_restriction.value
      }
    }

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0 # scale to zero when idle (ADR-0020, decision 7)
    max_replicas = 1

    container {
      name   = each.value.name
      image  = var.image_placeholder
      cpu    = 0.5
      memory = "1Gi"

      dynamic "env" {
        for_each = { for k, v in each.value.env : k => v if v != "" }
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = each.value.secrets
        content {
          name        = env.value
          secret_name = env.key
        }
      }
    }
  }

  # The application deploy stage owns the image (a digest from the registry). Terraform must not put the placeholder back.
  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_container_app.redis, azurerm_container_app.redis_cache, azurerm_container_app.redis_sessions, azurerm_container_app.mock]
}

# ---- The seed job (register item 224; decided by the lead 2026-11-20) -------------------------------------------------------------------
# The seed runs inside the environment because its VendorVerified events go to the events Redis, which only apps in the environment can reach. Started by
# hand from the application deploy (az containerapp job start), never on a schedule. The seed's own guard (SeedTarget) refuses any database but the local
# emulator unless both settings below are present and the environment is dev or uat (WI-DEP-002 step 4), and creates nothing here: the containers above
# are this stack's. Billed only while it runs.
resource "azurerm_container_app_job" "seed" {
  name                         = "seed"
  resource_group_name          = local.rg
  location                     = local.location
  container_app_environment_id = azurerm_container_app_environment.env.id
  workload_profile_name        = "Consumption" # what Azure assigns anyway (see the environment)
  replica_timeout_in_seconds   = 600
  replica_retry_limit          = 0 # a failed seed is looked at, not retried
  tags                         = local.tags

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [var.app_identity_id]
  }

  registry {
    server   = var.registry_login_server
    identity = var.app_identity_id
  }

  secret {
    name                = "cosmos-connection-string"
    identity            = var.app_identity_id
    key_vault_secret_id = azurerm_key_vault_secret.placeholder["cosmos-connection-string"].versionless_id
  }

  template {
    container {
      name   = "seed"
      image  = var.image_placeholder
      cpu    = 0.25
      memory = "0.5Gi"

      dynamic "env" {
        for_each = {
          Seed__AllowDeployed     = "true"
          Deployment__Environment = var.environment # the seed refuses anything but "dev" or "uat"
          Redis__ConnectionString = local.dotnet_env.Redis__ConnectionString
          Cosmos__Database        = local.dotnet_env.Cosmos__Database
        }
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name        = "Cosmos__ConnectionString"
        secret_name = "cosmos-connection-string"
      }
    }
  }

  # The application deploy owns the image, as for the apps.
  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_container_app.redis]
}

# ---- The mock issuer (register item 102; chosen for the first deployed dev environment on 2026-10-31) -------------------------
# Public https ingress, because the browser logs in here. It signs tokens for whoever asks, so it is held to MockOidcDeployment: it starts in
# Production only with AllowDeployed, an environment that says it is dev or uat (WI-DEP-002 step 4), an https issuer, and the role list below
# (Customer only unless allowed_ips is set). Its ordering client secret is the same Key Vault secret ordering presents; the post-apply step generates
# and stores it.
resource "azurerm_container_app" "mock" {
  count                        = local.use_mock ? 1 : 0
  name                         = "mock-oidc"
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption" # what Azure assigns anyway (see the environment); unset, every plan would try to remove it
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.app_identity_id]
  }

  registry {
    server   = var.registry_login_server
    identity = var.app_identity_id
  }

  secret {
    name                = "ordering-client-secret"
    identity            = var.app_identity_id
    key_vault_secret_id = azurerm_key_vault_secret.placeholder["ordering-client-secret"].versionless_id
  }

  ingress {
    external_enabled = true
    target_port      = 5100
    transport        = "http"

    dynamic "ip_security_restriction" {
      for_each = var.allowed_ips
      content {
        name             = "allow-${replace(replace(ip_security_restriction.value, ".", "-"), "/", "-")}"
        action           = "Allow"
        ip_address_range = ip_security_restriction.value
      }
    }

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "mock-oidc"
      image  = var.image_placeholder
      cpu    = 0.25
      memory = "0.5Gi"

      dynamic "env" {
        for_each = merge(
          {
            ASPNETCORE_ENVIRONMENT = "Production" # deliberately not var.host_environment: Production is what makes the host enforce MockOidcDeployment
            # The ingress ends TLS and forwards plain http with X-Forwarded-Proto; without this the discovery document names http addresses, which the
            # services refuse (register 226, approved by the lead 2026-11-20). From outside only the ingress reaches the app.
            ASPNETCORE_FORWARDEDHEADERS_ENABLED                          = "true"
            Auth__Audience                                               = var.auth_audience
            MockOidc__AllowDeployed                                      = "true"
            Deployment__Environment                                      = var.environment # the issuer refuses anything but "dev" or "uat"
            MockOidc__Issuer                                             = local.mock_url
            MockOidc__IngressRestricted                                  = length(var.allowed_ips) > 0 ? "true" : "false"
            MockOidc__RedirectUris__0                                    = "${local.web_url}/api/auth/callback"
            "MockOidc__Clients__${var.service_auth_client_id}__Roles__0" = "Stock.Reserve"
          },
          { for i, r in var.issuer_roles : "MockOidc__AllowedRoles__${i}" => r },
        )
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name        = "MockOidc__Clients__${var.service_auth_client_id}__Secret"
        secret_name = "ordering-client-secret"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]

    precondition {
      condition     = alltrue([for r in var.issuer_roles : r == "Customer"]) || length(var.allowed_ips) > 0
      error_message = "Roles other than Customer may log in to the mock issuer only when allowed_ips restricts the environment to known addresses."
    }
  }
}
