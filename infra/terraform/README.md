# milloin Google Cloud infrastructure

This module provisions the minimum production foundation for a personal milloin instance.

## Fixed defaults

- Cloud Run region: `europe-north1` (Finland)
- Firestore: Native mode, regional `europe-north1`
- Cloud Run min instances: `0`
- Cloud Run max instances: `3`
- Runtime service account: `milloin-runtime`
- Artifact Registry repository: `milloin`

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
- public Cloud Run invoker binding.

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

## Safety

- Firestore uses API-level delete protection and `ABANDON` deletion policy.
- Secret containers use deletion protection.
- Cloud Run service deletion protection is enabled.
- `terraform.tfvars`, `.terraform/`, and Terraform state files are gitignored.
- Do not put secret payloads in `.tf` or `.tfvars` files.

The Cloud Run service starts with Google's bootstrap container. The application deployment pipeline replaces that image and Terraform intentionally ignores subsequent image-only changes.

## State

For this single-user project, the initial module intentionally does not bootstrap its own remote state backend. Keep the local state file secure. If maintenance becomes multi-machine or multi-user, move the state to a dedicated encrypted GCS backend as a separate change rather than mixing backend bootstrap into the application infrastructure.
