terraform {
  required_version = ">= 1.11.0" # write-only attributes (value_wo on the Key Vault placeholders)

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
      # Not purged on destroy (2026-11-20, register item 108): purging a deleted vault is a subscription-level action
      # (Microsoft.KeyVault/locations/deletedVaults/purge/action) that the deploy identity, limited to two resource groups, does not hold, so a
      # purge would fail the teardown part-way. The deleted vault and its deleted secrets are kept for the vault's soft-delete retention
      # (7 days) and hold the name; a rebuild in that time recovers the vault (recover_soft_deleted_key_vaults, the provider's default) or uses
      # a new KEY_VAULT_NAME. The lead can purge it by hand.
      purge_soft_delete_on_destroy          = false
      purge_soft_deleted_secrets_on_destroy = false
      recover_soft_deleted_key_vaults       = true
      recover_soft_deleted_secrets          = true
    }
  }
}
