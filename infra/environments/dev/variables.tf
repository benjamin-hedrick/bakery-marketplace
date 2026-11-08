variable "environment" {
  type        = string
  description = "Environment name; it must also appear in the resource group name (the destroy guard checks that)."
  default     = "dev"
}

variable "name_prefix" {
  type    = string
  default = "bakery"
}

variable "resource_group_name" {
  type        = string
  description = "The existing, empty resource group the bootstrap created. This stack creates nothing outside it and never creates or deletes the group."
  default     = "rg-bakery-dev"
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

variable "issuer_mode" {
  type        = string
  description = "mock: deploy the mock issuer as a container app and derive every issuer address from it (register item 102, decided 2026-10-31). entra: use the three settings below, which are then required (N-02)."
  default     = "mock"

  validation {
    condition     = contains(["mock", "entra"], var.issuer_mode)
    error_message = "issuer_mode must be mock or entra."
  }
}

variable "issuer_roles" {
  type        = list(string)
  description = "Mock issuer only: the roles whose users may log in. Customer only by default, so the public can sign in as a customer and nobody can obtain an Admin or Vendor token. Any other role requires allowed_ips (a precondition on the mock app)."
  default     = ["Customer"]
}

variable "allowed_ips" {
  type        = list(string)
  description = "CIDR ranges allowed to reach the web app and the mock issuer. Empty (the default) means open to everyone, which is only acceptable while issuer_roles is Customer only."
  default     = []
}

variable "auth_authority" {
  type        = string
  description = "Entra mode only: the token issuer the services validate (Auth__Authority)."
  default     = ""
}

variable "service_auth_token_endpoint" {
  type        = string
  description = "Entra mode only: the token endpoint ordering uses to call catalog (ServiceAuth__TokenEndpoint)."
  default     = ""
}

variable "web_auth_issuer" {
  type        = string
  description = "Entra mode only: where the browser logs in (AUTH_ISSUER, served by /api/config)."
  default     = ""
}

variable "auth_audience" {
  type    = string
  default = "bakery-marketplace"
}

variable "auth_metadata_address" {
  type        = string
  description = "Optional discovery document address when it differs from the authority (Auth__MetadataAddress). Empty for Entra."
  default     = ""
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
