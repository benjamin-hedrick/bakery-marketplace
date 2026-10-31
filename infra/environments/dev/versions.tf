terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }

  # One state file for this stack, in the state account made by the bootstrap; values passed at init, Entra authentication, no key (ADR-0020).
  backend "azurerm" {}
}

provider "azurerm" {
  features {
    key_vault {
      # A disposable environment: destroying it must not leave a soft-deleted vault holding the name (register item 108 records this).
      purge_soft_delete_on_destroy = true
    }
  }
}
