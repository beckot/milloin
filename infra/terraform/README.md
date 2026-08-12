# milloin Google Cloud infrastructure

This module provisions the minimum production foundation for a personal milloin instance.

## Fixed defaults

- Cloud Run region: `europe-north1` (Finland)
- Firestore: Native mode, regional `europe-north1`
- Cloud Run min instances: `0`
- Cloud Run max instances: `3`
- Runtime service account: `milloin-runtime`
- Deployment service account: `milloin-deploy`
- Artifact Registry repository: `milloin`
- GitHub deployment repository: `beckot/milloin`

The GCP project itself is intentionally **not** created by Terraform here. Project IDs are globally unique and billing-account permissions are user-specific. Create or select a dedicated project first, then pass its ID as `project_id`.

## Resources

Terraform creates:

- required Google APIs;
- Artifact Registry Docker repository;
- Firestore default database with deletion protection;
- dedicated Cloud Run runtime service account;
- least-privilege Firestore data access for that service account;
- empty Secret Manager containers for Google OAuth, owner API access, and session signing;
- Cloud Run service with scale-to-zero and a small max-instance ceiling;
- public Cloud Run invoker binding;
- GitHub OIDC workload identity pool/provider restricted to the exact repository;
- keyless deployment service account with Cloud Run developer, Artifact Registry writer, and runtime-service-account impersonation permissions.

Secret **values are not stored in Terraform state**. They are populated separately during production configuration.

## First apply

```bash
gcloud auth application-default login
cp terraform.tfvars.example terraform.tfvars
# edit project_id
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

The target project must already have billing enabled and the caller must have enough IAM permissions to enable APIs and create the listed resources.

After apply, capture these outputs:

```bash
terraform output -raw project_id
terraform output -raw github_workload_identity_provider
terraform output -raw deployment_service_account
terraform output -raw cloud_run_url
```

Configure these GitHub repository/environment variables for the `production` deployment workflow:

- `GCP_PROJECT_ID` = `project_id`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` = `github_workload_identity_provider`
- `GCP_DEPLOY_SERVICE_ACCOUNT` = `deployment_service_account`

No Google service-account key is created or stored in GitHub.

## Application releases

`.github/workflows/deploy-production.yml` is deliberately manual and uses the GitHub `production` environment as a separate release gate.

A normal release:

1. obtains short-lived Google credentials through GitHub OIDC;
2. builds an image tagged with the Git commit SHA;
3. pushes it to Artifact Registry;
4. creates a tagged Cloud Run revision with **zero production traffic**;
5. smoke-tests `/api/health` directly on that candidate revision;
6. only after the candidate passes, moves 100% of traffic to the tested revision.

If the candidate fails its smoke test, existing production traffic remains on the previous revision.

For a rollback, manually run the same workflow and set `image_tag` to a previously deployed commit SHA. That image is deployed as a zero-traffic candidate, tested, then promoted using the same path.

## Safety

- Firestore uses API-level delete protection and `ABANDON` deletion policy.
- Secret containers use deletion protection.
- Cloud Run service deletion protection is enabled.
- `terraform.tfvars`, `.terraform/`, and Terraform state files are gitignored.
- Do not put secret payloads in `.tf` or `.tfvars` files.
- Production release never sends traffic to an untested candidate revision.

The Cloud Run service starts with Google's bootstrap container. The application deployment pipeline replaces that image and Terraform intentionally ignores subsequent image-only changes.

## State

For this single-user project, the initial module intentionally does not bootstrap its own remote state backend. Keep the local state file secure. If maintenance becomes multi-machine or multi-user, move the state to a dedicated encrypted GCS backend as a separate change rather than mixing backend bootstrap into the application infrastructure.
