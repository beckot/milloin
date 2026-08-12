# Production OAuth and secret configuration

This is the remaining manual configuration between `terraform apply` and the first real production deployment.

## 1. Get the Cloud Run service URL

After Terraform has created the bootstrap service:

```bash
cd infra/terraform
terraform output -raw cloud_run_url
```

Call the result `SERVICE_URL` below. It must be HTTPS.

## 2. Configure the Google OAuth Web client

Create or use a Google OAuth **Web application** client. Configure this exact authorized redirect URI:

```text
SERVICE_URL/api/auth/google/callback
```

Example shape only:

```text
https://milloin-xxxxx-lz.a.run.app/api/auth/google/callback
```

Do not guess the generated Cloud Run hostname; use the Terraform/Cloud Run output.

The application verifies the Google ID token and then checks its verified email against `MILLOIN_OWNER_EMAIL`. Only that one address can become organizer.

## 3. Add Secret Manager versions

Terraform creates the secret containers but intentionally does not put secret payloads into Terraform state.

Set shell variables locally. Do not paste their values into source code, GitHub issues, Terraform variables, or command-line arguments that remain in shell history.

```bash
export GCP_PROJECT_ID='your-project-id'
export GOOGLE_CLIENT_ID='...apps.googleusercontent.com'
export GOOGLE_CLIENT_SECRET='...'
export MILLOIN_SESSION_SECRET="$(openssl rand -base64 48)"
export MILLOIN_OWNER_API_KEY="$(openssl rand -base64 48)"
```

Add values over stdin:

```bash
printf '%s' "$GOOGLE_CLIENT_ID" \
  | gcloud secrets versions add google-client-id --project "$GCP_PROJECT_ID" --data-file=-

printf '%s' "$GOOGLE_CLIENT_SECRET" \
  | gcloud secrets versions add google-client-secret --project "$GCP_PROJECT_ID" --data-file=-

printf '%s' "$MILLOIN_SESSION_SECRET" \
  | gcloud secrets versions add milloin-session-secret --project "$GCP_PROJECT_ID" --data-file=-

printf '%s' "$MILLOIN_OWNER_API_KEY" \
  | gcloud secrets versions add milloin-owner-api-key --project "$GCP_PROJECT_ID" --data-file=-
```

Unset the secret values from the current shell when finished:

```bash
unset GOOGLE_CLIENT_SECRET MILLOIN_SESSION_SECRET MILLOIN_OWNER_API_KEY
```

Retain the owner API key in whatever private password/secret store you intend to use for your own AI clients. Losing it is recoverable by adding a new secret version and redeploying.

## 4. Configure GitHub production variables

The `production` GitHub environment/repository needs:

```text
GCP_PROJECT_ID
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
MILLOIN_OWNER_EMAIL
```

The first three come from Terraform outputs. `MILLOIN_OWNER_EMAIL` is the exact Google account that may organize polls.

There are no GCP service-account keys in GitHub. The workflow obtains short-lived Google credentials through Workload Identity Federation.

## 5. Deploy

Run the `Deploy production` GitHub Actions workflow manually.

Before building the candidate revision, the workflow:

1. resolves the existing Cloud Run service URL and uses it as `MILLOIN_BASE_URL`;
2. verifies that `MILLOIN_OWNER_EMAIL` is configured;
3. finds the newest enabled version number for each required Secret Manager secret;
4. pins those exact secret versions into the new Cloud Run revision.

The deployment does not expose secret payloads in GitHub. Secret Manager references are visible in Cloud Run configuration, but values are resolved by Cloud Run for the runtime service account.

The candidate receives zero production traffic until `/api/health` passes.

## 6. Production verification

Before closing issue #12, verify against the real production URL:

- allowed Google account signs in and gets an organizer session;
- a different Google account is rejected;
- logout removes organizer access;
- session expiry/tamper tests remain green in CI;
- an organizer poll created in the UI can be administered through REST/MCP with the production owner API key;
- no OAuth secret, session secret, owner API key, cookie, or Authorization header appears in application logs or Actions output.

The full production black-box lifecycle remains issue #14 and is the v1 go-live gate.

## Secret rotation

Add a new enabled Secret Manager version, then run the normal production deploy workflow. It resolves and pins the newest enabled version into a fresh zero-traffic candidate revision before promotion.

For the session secret, rotation invalidates existing organizer sessions. That is acceptable for this personal application; sign in again after deployment.

For the owner API key, update the private AI-client configuration after the new revision is promoted.
