terraform {
  required_version = ">= 1.11.0" # write-only attributes (value_wo on the Key Vault placeholders)

  # The providers this module uses. Their configuration (the azurerm features, the backend) belongs to each environment root.
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
}
