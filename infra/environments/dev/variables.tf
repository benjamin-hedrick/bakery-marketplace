variable "environment" {
  type    = string
  default = "dev"
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "resource_group_name" {
  type    = string
  default = "rg-bakery-dev"
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
  default = "cosmos-bakery-dev"
}
