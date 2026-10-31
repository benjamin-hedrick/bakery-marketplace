terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # State lives in the storage account made by the bootstrap runbook (docs/operations/runbooks/bootstrap-terraform-state.md), one state file per
  # stack. The values are passed at init (infra/foundation/backend.hcl.example), so this file names no account and holds no key; access is by
  # Entra identity (use_azuread_auth), never a storage key (ADR-0020).
  backend "azurerm" {}
}

# The subscription comes from ARM_SUBSCRIPTION_ID and the identity from the pipeline's federated connection (ARM_USE_OIDC) or the person's
# `az login`; nothing here names either.
provider "azurerm" {
  features {}
}
