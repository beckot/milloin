#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/bootstrap-production.sh PROJECT_ID [--apply]

Plans the milloin Google Cloud infrastructure against an existing billed GCP project.
Nothing is applied unless --apply is explicitly supplied.

Optional environment variables:
  MILLOIN_OPERATOR_EMAIL       Cloud Monitoring notification email
  MILLOIN_BILLING_ACCOUNT_ID   Cloud Billing account ID for the optional budget
  MILLOIN_BUDGET_CURRENCY      Billing-account currency, e.g. EUR
  MILLOIN_MONTHLY_BUDGET       Whole currency units; default 10

Prerequisites:
  gcloud, terraform, authenticated Application Default Credentials, and sufficient
  IAM rights in the target project.
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

PROJECT_ID="$1"
MODE="plan"
if [[ ${2:-} == "--apply" ]]; then
  MODE="apply"
elif [[ $# -eq 2 ]]; then
  usage >&2
  exit 2
fi

for command in gcloud terraform; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if ! gcloud projects describe "$PROJECT_ID" --format='value(projectId)' >/dev/null 2>&1; then
  echo "Cannot access GCP project '$PROJECT_ID'. Check the ID and your gcloud credentials." >&2
  exit 1
fi

if ! gcloud beta billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null | grep -qx 'True'; then
  echo "GCP project '$PROJECT_ID' does not appear to have billing enabled, or billing status cannot be read." >&2
  echo "Cloud Run/Artifact Registry provisioning requires a billed project." >&2
  exit 1
fi

export TF_VAR_project_id="$PROJECT_ID"
export TF_VAR_region="europe-north1"
export TF_VAR_github_repository="beckot/milloin"
export TF_VAR_max_instances="3"

if [[ -n ${MILLOIN_OPERATOR_EMAIL:-} ]]; then
  export TF_VAR_operator_email="$MILLOIN_OPERATOR_EMAIL"
fi

if [[ -n ${MILLOIN_BILLING_ACCOUNT_ID:-} || -n ${MILLOIN_BUDGET_CURRENCY:-} ]]; then
  if [[ -z ${MILLOIN_BILLING_ACCOUNT_ID:-} || -z ${MILLOIN_BUDGET_CURRENCY:-} ]]; then
    echo "Set both MILLOIN_BILLING_ACCOUNT_ID and MILLOIN_BUDGET_CURRENCY, or neither." >&2
    exit 1
  fi
  export TF_VAR_billing_account_id="$MILLOIN_BILLING_ACCOUNT_ID"
  export TF_VAR_budget_currency_code="$MILLOIN_BUDGET_CURRENCY"
  export TF_VAR_monthly_budget_units="${MILLOIN_MONTHLY_BUDGET:-10}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$ROOT_DIR/infra/terraform"

cd "$TF_DIR"

echo "Target project: $PROJECT_ID"
echo "Target region:  europe-north1"
echo "Mode:           $MODE"
echo

terraform init -input=false
terraform fmt -check -recursive
terraform validate
terraform plan -input=false -out=milloin.tfplan

if [[ "$MODE" == "plan" ]]; then
  echo
  echo "Plan created at infra/terraform/milloin.tfplan. No cloud resources were changed."
  echo "Review it, then rerun with --apply when ready."
  exit 0
fi

terraform apply -input=false milloin.tfplan
rm -f milloin.tfplan

echo
cat <<EOF
Infrastructure apply completed.

Cloud Run URL:
  $(terraform output -raw cloud_run_url)

GitHub production variables to configure:
  GCP_PROJECT_ID=$PROJECT_ID
  GCP_WORKLOAD_IDENTITY_PROVIDER=$(terraform output -raw github_workload_identity_provider)
  GCP_DEPLOY_SERVICE_ACCOUNT=$(terraform output -raw deployment_service_account)
  MILLOIN_OWNER_EMAIL=<your Google organizer email>

Next:
  1. Configure Google OAuth redirect URI using the Cloud Run URL.
  2. Add Secret Manager versions per docs/production-configuration.md.
  3. Set the GitHub production variables above.
  4. Run the manual 'Deploy production' workflow.
  5. Run docs/production-acceptance.md.
EOF
