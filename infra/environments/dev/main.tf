# The dev environment (ADR-0020): the shared environment module with dev's values. The resources are in infra/modules/environment (WI-DEP-002
# step 2a, 2026-11-21); this root holds the backend, the provider settings (versions.tf), what dev sets, and the moved blocks that kept the
# existing state's resources when they moved into the module.
#
# Dev is the only environment that runs as Development and names itself "dev", which is what allows chaos scenarios there (ADR-0024); no other
# root may set environment = "dev" (scripts/ci/tests/chaos-not-deployed.test.mjs).

module "environment" {
  source = "../../modules/environment"

  environment         = "dev"
  host_environment    = "Development" # decided 2026-11-09
  resource_group_name = "rg-bakery-dev"
  cosmos_free_tier    = true      # the subscription's one free-tier account (register 229: UAT's is not)
  cosmos_location     = "eastus2" # East US refused new Cosmos accounts on 2026-11-20

  # From the foundation and the pipeline (scripts/ci/dev-stack-env.sh exports them as TF_VAR_*).
  tenant_id                 = var.tenant_id
  registry_login_server     = var.registry_login_server
  app_identity_id           = var.app_identity_id
  app_identity_principal_id = var.app_identity_principal_id
  deploy_principal_id       = var.deploy_principal_id
  key_vault_name            = var.key_vault_name
  cosmos_account_name       = var.cosmos_account_name
  budget_contact_emails     = var.budget_contact_emails

  # Optional; unset (null) takes the module's default.
  issuer_mode                 = var.issuer_mode
  issuer_roles                = var.issuer_roles
  allowed_ips                 = var.allowed_ips
  auth_authority              = var.auth_authority
  service_auth_token_endpoint = var.service_auth_token_endpoint
  web_auth_issuer             = var.web_auth_issuer
  auth_metadata_address       = var.auth_metadata_address
  budget_amount               = var.budget_amount
}

# The resources were created at the root of this stack and moved into the module on 2026-11-21. These blocks tell Terraform they are the same
# objects, so the plan shows no change. They can be removed once every state that had the old addresses has been planned and applied with them.
moved {
  from = time_static.budget_created
  to   = module.environment.time_static.budget_created
}
moved {
  from = azurerm_consumption_budget_resource_group.env
  to   = module.environment.azurerm_consumption_budget_resource_group.env
}
moved {
  from = azurerm_log_analytics_workspace.logs
  to   = module.environment.azurerm_log_analytics_workspace.logs
}
moved {
  from = azurerm_container_app_environment.env
  to   = module.environment.azurerm_container_app_environment.env
}
moved {
  from = azurerm_key_vault.kv
  to   = module.environment.azurerm_key_vault.kv
}
moved {
  from = azurerm_role_assignment.kv_secrets_user_apps
  to   = module.environment.azurerm_role_assignment.kv_secrets_user_apps
}
moved {
  from = azurerm_role_assignment.kv_secrets_officer_deploy
  to   = module.environment.azurerm_role_assignment.kv_secrets_officer_deploy
}
moved {
  from = time_sleep.kv_roles
  to   = module.environment.time_sleep.kv_roles
}
moved {
  from = azurerm_key_vault_secret.placeholder
  to   = module.environment.azurerm_key_vault_secret.placeholder
}
moved {
  from = azurerm_cosmosdb_account.cosmos
  to   = module.environment.azurerm_cosmosdb_account.cosmos
}
moved {
  from = azurerm_cosmosdb_sql_database.bakery
  to   = module.environment.azurerm_cosmosdb_sql_database.bakery
}
moved {
  from = azurerm_cosmosdb_sql_container.catalog
  to   = module.environment.azurerm_cosmosdb_sql_container.catalog
}
moved {
  from = azurerm_cosmosdb_sql_container.orders
  to   = module.environment.azurerm_cosmosdb_sql_container.orders
}
moved {
  from = azurerm_cosmosdb_sql_container.vendor_orders
  to   = module.environment.azurerm_cosmosdb_sql_container.vendor_orders
}
moved {
  from = azurerm_cosmosdb_sql_container.preferences
  to   = module.environment.azurerm_cosmosdb_sql_container.preferences
}
moved {
  from = azurerm_cosmosdb_sql_container.payment_methods
  to   = module.environment.azurerm_cosmosdb_sql_container.payment_methods
}
moved {
  from = azurerm_container_app.redis
  to   = module.environment.azurerm_container_app.redis
}
moved {
  from = azurerm_container_app.redis_cache
  to   = module.environment.azurerm_container_app.redis_cache
}
moved {
  from = azurerm_container_app.redis_sessions
  to   = module.environment.azurerm_container_app.redis_sessions
}
moved {
  from = azurerm_container_app.apps
  to   = module.environment.azurerm_container_app.apps
}
moved {
  from = azurerm_container_app_job.seed
  to   = module.environment.azurerm_container_app_job.seed
}
moved {
  from = azurerm_container_app.mock
  to   = module.environment.azurerm_container_app.mock
}
