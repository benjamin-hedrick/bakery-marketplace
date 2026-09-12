variable "environment" {
  type        = string
  description = "Target deployment environment (e.g. dev, staging, prod)"
}

variable "location" {
  type        = string
  description = "Azure region for resource placement"
  default     = "eastus"
}

variable "resource_group_name" {
  type        = string
  description = "Resource group name for Key Vault"
}

variable "tenant_id" {
  type        = string
  description = "Azure AD tenant ID"
  sensitive   = true
}

variable "service_principal_ids" {
  type        = map(string)
  description = "Map of container app service names to their system-assigned managed identity principal IDs"
  default     = {}
}

variable "cosmos_account_name" {
  type        = string
  description = "Cosmos DB account name for Azure AD RBAC data-plane role assignment"
  default     = ""
}

variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}
