variable "name_prefix" {
  type        = string
  description = "Short name used in resource names, e.g. bakery."
  default     = "bakery"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}$", var.name_prefix))
    error_message = "name_prefix must be 2 to 19 characters: lower-case letters, digits and hyphens, starting with a letter."
  }
}

variable "location" {
  type        = string
  description = "Azure region for the foundation stack."
  default     = "eastus"
}

variable "registry_name" {
  type        = string
  description = "Container registry name. Globally unique, 5 to 50 letters and digits (for example bakerymkt followed by a few characters of your own)."

  validation {
    condition     = can(regex("^[a-zA-Z0-9]{5,50}$", var.registry_name))
    error_message = "registry_name must be 5 to 50 letters and digits only."
  }
}

variable "acr_push_principals" {
  type        = map(string)
  description = "Identities that may push images (the deploy pipeline's identity): a label mapped to the identity's object id. The label is only for the plan output."
  default     = {}
}

variable "acr_pull_principals" {
  type        = map(string)
  description = "Identities that may pull images (each environment's container apps identity, added when that environment exists): a label mapped to the object id."
  default     = {}
}

variable "budget_amount" {
  type        = number
  description = "Monthly budget for the foundation resource group, in the subscription's currency. The alert only notifies; it deletes nothing."
  default     = 10

  validation {
    condition     = var.budget_amount > 0
    error_message = "budget_amount must be greater than zero."
  }
}

variable "budget_contact_emails" {
  type        = list(string)
  description = "Who is told at 80 percent of the budget (actual) and when 100 percent is forecast. Empty creates no budget."
  default     = []
}

variable "budget_start_date" {
  type        = string
  description = "First day of a month, in UTC, at which the budget starts (RFC 3339)."
  default     = "2026-11-01T00:00:00Z"

  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-01T00:00:00Z$", var.budget_start_date))
    error_message = "budget_start_date must be the first day of a month at 00:00:00Z, for example 2026-11-01T00:00:00Z."
  }
}

variable "tags" {
  type        = map(string)
  description = "Extra tags on every resource."
  default     = {}
}

variable "app_identities" {
  type        = set(string)
  description = "Names of environments (for example dev) that get a user-assigned identity for their container apps. The identity lives here, not in the environment stack, so the AcrPull grant on the registry survives a teardown and the destroy guard never has to touch this resource group."
  default     = []

  validation {
    condition     = alltrue([for n in var.app_identities : can(regex("^[a-z][a-z0-9-]{1,18}$", n))])
    error_message = "Each environment name must be 2 to 19 characters: lower-case letters, digits and hyphens, starting with a letter."
  }
}
