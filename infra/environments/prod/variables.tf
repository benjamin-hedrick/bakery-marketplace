variable "environment" {
  type    = string
  default = "prod"
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "resource_group_name" {
  type    = string
  default = "rg-bakery-prod"
}

variable "tenant_id" {
  type      = string
  sensitive = true
}

variable "service_principal_ids" {
  type      = map(string)
  default   = {}
  sensitive = true
}

variable "cosmos_account_name" {
  type    = string
  default = "cosmos-bakery-prod"
}
