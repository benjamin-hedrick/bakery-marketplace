# Sourced (not run) by the dev pipeline's Terraform steps, inside an AzureCLI@2 step with addSpnToEnvironment (ADR-0020, WI-DEP-001):
#
#   source scripts/ci/dev-stack-env.sh "${PLAN_CONNECTION_ID:-}" "$(ENVIRONMENT_NAME)"     (or "${DEPLOY_CONNECTION_ID:-}")
#
# The environment comes in as an argument, filled in by the pipeline's macro, never read from the ENVIRONMENT_NAME environment variable: in a
# deployment job Azure DevOps exports its own Environment.Name (the approval environment, e.g. dev-infra) under that same name. The first dev
# deploy run stopped silently here in its apply step (2026-11-20), after the plan stage, a plain job, had passed with the same script.
#
# It checks the pipeline variables, signs Terraform in through the service connection with Azure DevOps' token refresh (the federated token a
# step receives lasts about 10 minutes, shorter than an apply; with the connection id, the job's access token and the OIDC request address,
# the provider and the state backend ask for a fresh one when they need it), initialises the foundation and dev stacks against the remote state,
# and exports the dev stack's inputs: from the foundation's state outputs (registry, apps identity), the sign-in (tenant) and the pipeline
# variables. Nothing here is printed except Terraform's own init output. The budget e-mail is a secret pipeline variable so the log masks it.
set -euo pipefail

connection_id="${1:-}"
environment="${2:-}"
case "$environment" in
  '' | *'$('*)
    echo "##vso[task.logissue type=error]No environment was given (second argument: \"\$(ENVIRONMENT_NAME)\", the pipeline variable)."
    exit 1
    ;;
esac
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

backend=(-input=false -backend-config=resource_group_name=rg-bakery-tfstate -backend-config="storage_account_name=$TF_STATE_ACCOUNT"
  -backend-config=container_name=tfstate -backend-config=use_azuread_auth=true)

terraform -chdir=infra/foundation init "${backend[@]}" -backend-config=key=foundation.tfstate
foundation=$(terraform -chdir=infra/foundation output -json)
# jq -e exits 1 without a word on a missing value; each lookup names what it could not find (names only, no value is printed). It runs inside
# $(...), so the message goes to stderr, which the step's log shows.
foundation_output() {
  local value
  if ! value=$(jq -er --arg e "$environment" "$1" <<<"$foundation"); then
    echo "ERROR: the foundation state has no $2 (lookup $1, environment '$environment'; outputs present: $(jq -c 'keys' <<<"$foundation"))." >&2
    return 1
  fi
  printf '%s' "$value"
}
export TF_VAR_tenant_id="$tenantId"
TF_VAR_registry_login_server=$(foundation_output '.registry_login_server.value' 'registry login server')
TF_VAR_app_identity_id=$(foundation_output '.app_identities.value[$e].id' 'apps identity id')
TF_VAR_app_identity_principal_id=$(foundation_output '.app_identities.value[$e].principal_id' 'apps identity principal id')
TF_VAR_budget_contact_emails=$(jq -nc --arg e "$BUDGET_CONTACT_EMAIL" '[$e]')
export TF_VAR_registry_login_server TF_VAR_app_identity_id TF_VAR_app_identity_principal_id TF_VAR_budget_contact_emails
export TF_VAR_deploy_principal_id="$DEPLOY_PRINCIPAL_ID" TF_VAR_key_vault_name="$KEY_VAULT_NAME" TF_VAR_cosmos_account_name="$COSMOS_ACCOUNT_NAME"

terraform -chdir="infra/environments/$environment" init "${backend[@]}" -backend-config="key=$environment.tfstate"
