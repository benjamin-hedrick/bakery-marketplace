# The UAT environment (ADR-0020 decision 9 and its note of 2026-11-21; WI-DEP-002 step 5): the same environment module as dev, with UAT's values.
# Deployed on demand by azure-pipelines-uat.yml in promote mode (a dev build whose smoke passed; no image is built for UAT), and torn down like dev.
#
# What differs from dev, and why:
# - It runs the services as Production (decided by the lead 2026-11-21: part of what UAT tests), so the Development settings and chaos never apply.
#   It never names a chaos scenario (ADR-0024; scripts/ci/tests/chaos-not-deployed.test.mjs) and never names itself "dev".
# - Its group, rg-bakery-uat, is in East US 2: the subscription allows one Container Apps environment per region and dev's is in East US (register 229).
#   The apps go where the group is (the module reads the group's location), and Cosmos goes there too.
# - Its Cosmos account is not on the free tier: the subscription's one free-tier account is dev's.
# - Its state is in its own container, tfstate-uat (decision 3), given at init by scripts/ci/dev-stack-env.sh.

module "environment" {
  source = "../../modules/environment"

  environment         = "uat"
  host_environment    = "Production"
  resource_group_name = "rg-bakery-uat"
  cosmos_free_tier    = false
  cosmos_location     = "eastus2"

  # From the foundation and the pipeline (pipeline variables exported as TF_VAR_*; the foundation's outputs are plain pipeline variables for UAT,
  # not a read of the foundation's state, register 214).
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
