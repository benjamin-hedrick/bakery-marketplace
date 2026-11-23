variable "environment" {
  type        = string
  description = "Environment name (dev, uat); it must also appear in the resource group name (the destroy guard checks that). Each root sets it; only the dev root may set dev."
}

variable "host_environment" {
  type        = string
  description = "ASPNETCORE_ENVIRONMENT of the .NET services this stack deploys (catalog, ordering). Each environment's root sets its own value: dev runs as Development (decided 2026-11-09), so the Development settings and chaos scenarios (ADR-0024) apply, and a later UAT or production root sets Production. It does not cover the mock issuer, which stays Production because that is what makes MockOidcDeployment enforce its guards."

  validation {
    condition     = contains(["Development", "Staging", "Production"], var.host_environment)
    error_message = "host_environment must be Development, Staging or Production."
  }

  # Development turns chaos scenarios on (ADR-0024) and relaxes nothing else (register 176), so only the dev environment's own root may use it. A UAT or
  # production root is another environment name and has to set Staging or Production: it cannot take Development by leaving the default.
  validation {
    condition     = var.host_environment != "Development" || var.environment == "dev"
    error_message = "host_environment may be Development only when environment is dev; other environments must set Staging or Production."
  }
}

variable "chaos_scenario" {
  type        = string
  description = "The chaos scenario every app of the environment starts with (ADR-0024, WI-CHAOS-006): none, or the name of a file in chaos/scenarios/ (dev-chaos). Only the dev environment may name one; the apps' own start-up gates refuse chaos anywhere else as well. It lives as long as the deployment, until a run changes it."
  default     = "none"
  nullable    = false

  validation {
    condition     = var.chaos_scenario == "none" || can(regex("^[a-z0-9][a-z0-9-]*$", var.chaos_scenario))
    error_message = "chaos_scenario must be none or the plain name of a scenario file (lower-case letters, digits and dashes)."
  }

  validation {
    condition     = var.chaos_scenario == "none" || var.environment == "dev"
    error_message = "chaos_scenario may name a scenario only when environment is dev; UAT and production never run chaos (ADR-0024)."
  }
}

variable "cache_redis" {
  type        = bool
  description = "Whether the environment has the cache Redis app (ADR-0002, register 216 option d). Off, the app is not created and the catalog's listing cache runs in process (Cache__Backend local): one always-on app fewer. The events and sessions Redis apps stay either way (the seed job's events reach the catalog through the events Redis; the session store refuses memory off loopback). Only dev may turn it off; UAT and production keep the shape production would have."
  default     = true
  nullable    = false

  validation {
    condition     = var.cache_redis || var.environment == "dev"
    error_message = "cache_redis may be false only when environment is dev; UAT and production keep the cache Redis (register 216)."
  }
}

variable "name_prefix" {
  type    = string
  default = "bakery"
}

variable "resource_group_name" {
  type        = string
  description = "The existing, empty resource group the bootstrap created. This stack creates nothing outside it and never creates or deletes the group."
}

variable "tenant_id" {
  type        = string
  description = "The Entra tenant id (not a secret)."
}

variable "registry_login_server" {
  type        = string
  description = "Foundation output registry_login_server, for example bakerymkt123.azurecr.io."
}

variable "app_identity_id" {
  type        = string
  description = "Foundation output app_identities[env].id: the persistent identity the container apps run as (it already has AcrPull)."
}

variable "app_identity_principal_id" {
  type        = string
  description = "Foundation output app_identities[env].principal_id."
}

variable "deploy_principal_id" {
  type        = string
  description = "Object id of the pipeline's apply identity. It is granted Key Vault Secrets Officer on this environment's vault, to create the placeholder secrets and to set the real values after apply. Part of the role-assignment condition (approved 2026-10-31) (register item 108)."
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "key_vault_name" {
  type        = string
  description = "Globally unique, 3 to 24 characters."

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]$", var.key_vault_name))
    error_message = "key_vault_name must be 3 to 24 characters: letters, digits and hyphens, starting with a letter."
  }
}

variable "cosmos_account_name" {
  type        = string
  description = "Globally unique, 3 to 44 lower-case letters, digits and hyphens."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,42}[a-z0-9]$", var.cosmos_account_name))
    error_message = "cosmos_account_name must be 3 to 44 characters: lower-case letters, digits and hyphens."
  }
}

variable "cosmos_free_tier" {
  type        = bool
  description = "Use the Cosmos free tier (one account per subscription; creation fails if the subscription already has one)."
  default     = true
}

variable "cosmos_location" {
  type        = string
  description = "Region of the Cosmos account. Not the resource group's: on 2026-11-20 East US refused new Cosmos accounts for this subscription (\"high demand\"; az cosmosdb locations list shows isSubscriptionRegionAccessAllowedForRegular false). East US 2 is the nearest region that allows them."
  default     = "eastus2"

  validation {
    condition     = length(var.cosmos_location) > 0
    error_message = "cosmos_location must name a region."
  }
}

variable "issuer_mode" {
  type        = string
  description = "mock: deploy the mock issuer as a container app and derive every issuer address from it (register item 102, decided 2026-10-31). entra: use the three settings below, which are then required (N-02)."
  default     = "mock"
  nullable    = false

  validation {
    condition     = contains(["mock", "entra"], var.issuer_mode)
    error_message = "issuer_mode must be mock or entra."
  }

  # Without the mock issuer and without these, the services would have no authority and the web app no AUTH_ISSUER: its session layer would not
  # configure and nobody could log in (WI-DEP-002, 2026-11-21). Until Entra External ID exists (register 222) no environment can give them, so a
  # pipeline run with the mock issuer switched off is refused here at plan time, as well as by the pipeline's inputs stage.
  validation {
    condition     = var.issuer_mode == "mock" || (var.auth_authority != "" && var.service_auth_token_endpoint != "" && var.web_auth_issuer != "")
    error_message = "issuer_mode entra needs auth_authority, service_auth_token_endpoint and web_auth_issuer; until Entra External ID exists (register 222) an environment needs the mock issuer."
  }
}

variable "issuer_roles" {
  type        = list(string)
  description = "Mock issuer only: the roles whose users may log in. Customer only by default, so the public can sign in as a customer and nobody can obtain an Admin or Vendor token. Any other role requires allowed_ips (a precondition on the mock app)."
  default     = ["Customer"]
  nullable    = false
}

variable "allowed_ips" {
  type        = list(string)
  description = "CIDR ranges allowed to reach the web app and the mock issuer. Empty (the default) means open to everyone, which is only acceptable while issuer_roles is Customer only."
  default     = []
  nullable    = false
}

variable "auth_authority" {
  type        = string
  description = "Entra mode only: the token issuer the services validate (Auth__Authority)."
  default     = ""
  nullable    = false

  validation {
    condition     = var.auth_authority == "" || startswith(var.auth_authority, "https://")
    error_message = "auth_authority must be empty or an https:// address. In Development the services accept plain-http metadata and token endpoints, so this is the guard that keeps a deployed environment on https."
  }
}

variable "service_auth_token_endpoint" {
  type        = string
  description = "Entra mode only: the token endpoint ordering uses to call catalog (ServiceAuth__TokenEndpoint)."
  default     = ""
  nullable    = false

  validation {
    condition     = var.service_auth_token_endpoint == "" || startswith(var.service_auth_token_endpoint, "https://")
    error_message = "service_auth_token_endpoint must be empty or an https:// address. In Development the services accept plain-http metadata and token endpoints, so this is the guard that keeps a deployed environment on https."
  }
}

variable "web_auth_issuer" {
  type        = string
  description = "Entra mode only: where the browser logs in (AUTH_ISSUER, served by /api/config)."
  default     = ""
  nullable    = false

  validation {
    condition     = var.web_auth_issuer == "" || startswith(var.web_auth_issuer, "https://")
    error_message = "web_auth_issuer must be empty or an https:// address. In Development the services accept plain-http metadata and token endpoints, so this is the guard that keeps a deployed environment on https."
  }
}

variable "auth_audience" {
  type    = string
  default = "bakery-marketplace"
}

variable "auth_metadata_address" {
  type        = string
  description = "Optional discovery document address when it differs from the authority (Auth__MetadataAddress). Empty for Entra."
  default     = ""
  nullable    = false

  validation {
    condition     = var.auth_metadata_address == "" || startswith(var.auth_metadata_address, "https://")
    error_message = "auth_metadata_address must be empty or an https:// address. In Development the services accept plain-http metadata and token endpoints, so this is the guard that keeps a deployed environment on https."
  }
}

variable "service_auth_client_id" {
  type    = string
  default = "ordering-service"
}

variable "service_auth_scope" {
  type    = string
  default = "bakery-marketplace/.default"
}

variable "web_auth_client_id" {
  type    = string
  default = "web-customer"
}

variable "image_placeholder" {
  type        = string
  description = "Image every app starts with. The application deploy stage replaces it with a digest from the registry; Terraform ignores later image changes (ADR-0020, decision 6)."
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "budget_amount" {
  type        = number
  description = "Monthly budget for the environment's resource group, in the subscription's currency. The alert only notifies; it deletes nothing, and Azure's cost data lags by several hours, so it is a backstop, not a meter."
  default     = 10
  nullable    = false

  validation {
    condition     = var.budget_amount > 0
    error_message = "budget_amount must be greater than zero."
  }
}

variable "budget_contact_emails" {
  type        = list(string)
  description = "Who is told at 80 percent of the budget (actual) and when 100 percent is forecast. Empty creates no budget. Private: passed by the pipeline (BUDGET_CONTACT_EMAIL), never written in this repository."
  default     = []
  nullable    = false
}

variable "otel_collector_version" {
  type        = string
  description = "The tag of the OpenTelemetry collector contrib image the tracing collector runs (docker.io/otel/opentelemetry-collector-contrib). The version docker-compose.yml pins and cloud.yaml was validated with; change them together."
  default     = "0.165.0"
  nullable    = false
}

variable "tracing" {
  type        = bool
  description = "Whether the environment sends traces to Application Insights through an OpenTelemetry collector (WI-OBS-001, ADR-0016): an Application Insights resource on the environment's Log Analytics workspace, a collector app (internal, always on), a Key Vault secret for the connection string, and the endpoint on the four apps. Off, none of it exists and the apps export nothing, as before. Default off so a stack that has not asked for it is unchanged; the dev root turns it on."
  default     = false
  nullable    = false
}
