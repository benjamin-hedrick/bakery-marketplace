terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
  }
}

provider "azurerm" {
  features {}
}

module "key_vault" {
  source                = "../../modules/key_vault"
  environment           = var.environment
  location              = var.location
  resource_group_name   = var.resource_group_name
  tenant_id             = var.tenant_id
  service_principal_ids = var.service_principal_ids
  cosmos_account_name   = var.cosmos_account_name
}
