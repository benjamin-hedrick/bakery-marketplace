# The disposable dev environment (ADR-0020). It works inside the resource group the bootstrap created and never creates or deletes that group;
# teardown empties it. Everything here is destroyed by the manual destroy run (scripts/ci/destroy-guard.mjs checks the plan first).
# Persistent things (registry, the apps identity and its AcrPull) live in infra/foundation.
#
# Written and checked with mocked providers only (node scripts/ci/terraform-checks.mjs --roots infra/foundation,infra/environments/dev).
# Never planned or applied against Azure. What was and was not verified: docs/evidence/WI-DEP-001/.

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

  # Secrets whose real value never passes through Terraform or its state (ADR-0020, decision 4).
  # Terraform creates each with a placeholder and ignores later changes; a pipeline step sets the real value with "az keyvault secret set".
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
  dotnet_env = {
    ASPNETCORE_ENVIRONMENT  = "Production"
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
      env      = local.dotnet_env
      secrets  = { "cosmos-connection-string" = "Cosmos__ConnectionString" }
    }
    ordering = {
      name     = "ordering"
      port     = 5300
      external = false
      env = merge(local.dotnet_env, {
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
      env = {
        CATALOG_URL  = "http://catalog"
        ORDERING_URL = "http://ordering"
      }
      secrets = {}
    }
    web = {
      name     = "web"
      port     = 3000
      external = true
      env = {
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
      }
      secrets = { "session-encryption-key" = "SESSION_ENCRYPTION_KEY" }
    }
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
  value        = local.placeholder_value
  key_vault_id = azurerm_key_vault.kv.id
  tags         = local.tags
  depends_on   = [time_sleep.kv_roles]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

# ---- Cosmos DB: the account, one database, the containers the services expect (DATA-004) -------------------------------------------
resource "azurerm_cosmosdb_account" "cosmos" {
  name                = var.cosmos_account_name
  resource_group_name = local.rg
  location            = local.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  free_tier_enabled   = var.cosmos_free_tier

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = local.location
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
      args   = ["redis-server", "--save", "", "--appendonly", "no"]
    }
  }
}

# The cache Redis (ADR-0002): internal only, no persistence, a separate instance from the event Redis so eviction can never touch the event streams.
# It is on its own TCP port because two TCP apps in one environment cannot share an exposed port. A full cache evicts the least recently used
# keys; sessions are NOT kept here (they are in redis-sessions below, register item 118).
resource "azurerm_container_app" "redis_cache" {
  name                         = "redis-cache"
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
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
    min_replicas = 1 # sessions live in memory; scaling to zero would log everyone out
    max_replicas = 1

    container {
      name   = "redis"
      image  = "docker.io/library/redis:7.4-alpine"
      cpu    = 0.25
      memory = "0.5Gi"
      args   = ["redis-server", "--save", "", "--appendonly", "no", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
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
      args   = ["redis-server", "--save", "", "--appendonly", "no", "--maxmemory", "128mb", "--maxmemory-policy", "noeviction"]
    }
  }
}

resource "azurerm_container_app" "apps" {
  for_each                     = local.apps
  name                         = each.value.name
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
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

  depends_on = [azurerm_container_app.redis, azurerm_container_app.mock]
}

# ---- The mock issuer (register item 102; chosen for the first deployed dev environment on 2026-10-31) -------------------------
# Public https ingress, because the browser logs in here. It signs tokens for whoever asks, so it is held to MockOidcDeployment: it starts in
# Production only with AllowDeployedDev, an https issuer, and the role list below (Customer only unless allowed_ips is set). Its ordering client
# secret is the same Key Vault secret ordering presents; the post-apply step generates and stores it.
resource "azurerm_container_app" "mock" {
  count                        = local.use_mock ? 1 : 0
  name                         = "mock-oidc"
  resource_group_name          = local.rg
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
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
            ASPNETCORE_ENVIRONMENT                                       = "Production"
            Auth__Audience                                               = var.auth_audience
            MockOidc__AllowDeployedDev                                   = "true"
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
