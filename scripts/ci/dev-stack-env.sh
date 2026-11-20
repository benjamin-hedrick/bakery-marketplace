# Sourced (not run) by the dev pipeline's Terraform steps, inside an AzureCLI@2 step with addSpnToEnvironment (ADR-0020, WI-DEP-001):
#
#   source scripts/ci/dev-stack-env.sh "$PLAN_CONNECTION_ID"     (or "$DEPLOY_CONNECTION_ID")
#
# It checks the pipeline variables, signs Terraform in through the service connection with Azure DevOps' token refresh (the federated token a
# step receives lasts about 10 minutes, shorter than an apply; with the connection id, the job's access token and the OIDC request address,
# the provider and the state backend ask for a fresh one when they need it), initialises the foundation and dev stacks against the remote state,
# and exports the dev stack's inputs: from the foundation's state outputs (registry, apps identity), the sign-in (tenant) and the pipeline
# variables. Nothing here is printed except Terraform's own init output. The budget e-mail is a secret pipeline variable so the log masks it.
set -euo pipefail

connection_id="${1:-}"
for v in ARM_SUBSCRIPTION_ID TF_STATE_ACCOUNT DEPLOY_PRINCIPAL_ID KEY_VAULT_NAME COSMOS_ACCOUNT_NAME BUDGET_CONTACT_EMAIL SYSTEM_ACCESSTOKEN SYSTEM_OIDCREQUESTURI; do
  if [ -z "${!v:-}" ]; then
    echo "##vso[task.logissue type=error]$v is not set (pipeline variables: the header of azure-pipelines-dev.yml)."
    exit 1
  fi
done
# A secret variable reaches the step only through the step's env mapping, and an undefined one arrives as its own macro text.
case "$BUDGET_CONTACT_EMAIL$connection_id" in
  *'$('*)
    echo "##vso[task.logissue type=error]BUDGET_CONTACT_EMAIL or a connection id is not set in the pipeline's variables."
    exit 1
    ;;
esac
if [ -z "$connection_id" ]; then
  echo "##vso[task.logissue type=error]No service connection id was given (pipeline variables PLAN_CONNECTION_ID and DEPLOY_CONNECTION_ID)."
  exit 1
fi
if [ -z "${servicePrincipalId:-}" ] || [ -z "${tenantId:-}" ]; then
  echo "##vso[task.logissue type=error]Run inside an AzureCLI@2 step with addSpnToEnvironment: true."
  exit 1
fi

export ARM_USE_OIDC=true ARM_CLIENT_ID="$servicePrincipalId" ARM_TENANT_ID="$tenantId"
export ARM_ADO_PIPELINE_SERVICE_CONNECTION_ID="$connection_id" ARM_OIDC_AZURE_SERVICE_CONNECTION_ID="$connection_id"
export ARM_OIDC_REQUEST_TOKEN="$SYSTEM_ACCESSTOKEN" ARM_OIDC_REQUEST_URL="$SYSTEM_OIDCREQUESTURI"
unset ARM_OIDC_TOKEN
export TF_IN_AUTOMATION=1 TF_INPUT=0

environment="${ENVIRONMENT_NAME:-dev}"
backend=(-input=false -backend-config=resource_group_name=rg-bakery-tfstate -backend-config="storage_account_name=$TF_STATE_ACCOUNT"
  -backend-config=container_name=tfstate -backend-config=use_azuread_auth=true)

terraform -chdir=infra/foundation init "${backend[@]}" -backend-config=key=foundation.tfstate
foundation=$(terraform -chdir=infra/foundation output -json)
export TF_VAR_tenant_id="$tenantId"
TF_VAR_registry_login_server=$(jq -er '.registry_login_server.value' <<<"$foundation")
TF_VAR_app_identity_id=$(jq -er --arg e "$environment" '.app_identities.value[$e].id' <<<"$foundation")
TF_VAR_app_identity_principal_id=$(jq -er --arg e "$environment" '.app_identities.value[$e].principal_id' <<<"$foundation")
TF_VAR_budget_contact_emails=$(jq -nc --arg e "$BUDGET_CONTACT_EMAIL" '[$e]')
export TF_VAR_registry_login_server TF_VAR_app_identity_id TF_VAR_app_identity_principal_id TF_VAR_budget_contact_emails
export TF_VAR_deploy_principal_id="$DEPLOY_PRINCIPAL_ID" TF_VAR_key_vault_name="$KEY_VAULT_NAME" TF_VAR_cosmos_account_name="$COSMOS_ACCOUNT_NAME"

terraform -chdir="infra/environments/$environment" init "${backend[@]}" -backend-config="key=$environment.tfstate"
