# What the dev root takes from outside. Descriptions and checks are the module's (infra/modules/environment/variables.tf); the values dev fixes
# (its name, group, host environment, Cosmos tier and region) are in main.tf.

# Set by the pipeline (scripts/ci/dev-stack-env.sh) or a local dev.tfvars (terraform.tfvars.example).
variable "tenant_id" {
  type = string
}

variable "registry_login_server" {
  type = string
}

variable "app_identity_id" {
  type = string
}

variable "app_identity_principal_id" {
  type = string
}

variable "deploy_principal_id" {
  type = string
}

variable "key_vault_name" {
  type = string
}

variable "cosmos_account_name" {
  type = string
}

# Optional. Unset (null) means the module's default.
variable "budget_contact_emails" {
  type    = list(string)
  default = null
}

variable "issuer_mode" {
  type    = string
  default = null
}

variable "issuer_roles" {
  type    = list(string)
  default = null
}

variable "allowed_ips" {
  type    = list(string)
  default = null
}

variable "auth_authority" {
  type    = string
  default = null
}

variable "service_auth_token_endpoint" {
  type    = string
  default = null
}

variable "web_auth_issuer" {
  type    = string
  default = null
}

variable "auth_metadata_address" {
  type    = string
  default = null
}

variable "budget_amount" {
  type    = number
  default = null
}

variable "chaos_scenario" {
  type    = string
  default = null
}
