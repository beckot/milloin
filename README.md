# milloin

Small self-hosted scheduling polls for personal use. The organizer proposes candidate times, shares one link, participants answer Yes / No / unanswered, and the organizer chooses the final time.

Finnish is the default UI language. English is available from the language switch.

## Status

The v1 application works locally and is covered by unit, MCP, container and browser E2E tests. **Production is not live until the Google Cloud project, OAuth credentials, secrets and final black-box production test are completed.** See GitHub issues #10–#14.

## Product scope

Included:

- Google-authenticated organizer;
- participant access without an account;
- cryptographically unguessable public poll links;
- Yes / No / unanswered voting — no Maybe state;
- private participant edit capability;
- visible participant names, votes and Yes counts;
- add/remove candidate times;
- select winner, close and reopen;
- `.ics` export of the selected time;
- Finnish + English UI;
- documented REST/OpenAPI interface;
- MCP endpoint for AI clients.

Deliberately not included in v1: email invitations, reminders, comments, teams, billing, attachments, recurring meetings or direct calendar synchronization.

## Architecture

```text
Browser UI ──────┐
REST / OpenAPI ──┼── application/domain services ── repository ── Firestore
MCP ─────────────┘
```

The UI, REST API and MCP adapter use the same `PollService`. Business rules do not live independently in each transport.

Main pieces:

- `src/domain` — scheduling rules and value types;
- `src/application` — poll use cases and authorization boundaries;
- `src/infrastructure` — Firestore and in-memory repositories;
- `src/api` — canonical REST transport and OpenAPI;
- `src/mcp` — thin MCP adapter over the same application service;
- `src/app` — Next.js UI and HTTP routes;
- `e2e` — Playwright human workflow;
- `infra/terraform` — Google Cloud foundation;
- `.github/workflows` — CI, Terraform validation, container smoke test and manual production deployment.

Production target: one Cloud Run service in `europe-north1`, Firestore Native mode, Artifact Registry and Secret Manager. Cloud Run scales to zero and has a deliberately low maximum instance count.

## Prerequisites

- Node.js 22+
- npm
- Docker for the production-container smoke test
- Terraform 1.9+ for infrastructure work
- Google Cloud CLI for production infrastructure/deployment administration
- a Google OAuth Web application for real organizer sign-in

## Fast local development

For normal application development, use in-memory persistence. It is much faster than provisioning Firestore.

```bash
cp .env.example .env.local
# fill the local-only values
npm install
npm run dev
```

Open `http://localhost:3000`.

The application still requires auth configuration because organizer routes use the same auth code as production. For local Google OAuth, configure this authorized redirect URI in the Google OAuth client:

```text
http://localhost:3000/api/auth/google/callback
```

Set `MILLOIN_OWNER_EMAIL` to the only Google account allowed to become organizer.

### Local storage modes

Default recommended development mode:

```text
MILLOIN_STORAGE=memory
```

Data disappears when the process restarts.

To exercise the Firestore repository locally, start a Firestore emulator in a second terminal:

```bash
npx firebase-tools emulators:start --only firestore --project demo-milloin
```

Then use:

```text
MILLOIN_STORAGE=firestore
GOOGLE_CLOUD_PROJECT=demo-milloin
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

`firestore.rules` denies direct client access. Browser clients never write Firestore directly; application endpoints validate and authorize requests before using the server-side Firestore client.

## Environment variables

Use `.env.example` as the local template. Never commit real values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MILLOIN_BASE_URL` | yes | Public application origin, e.g. `http://localhost:3000` or the production HTTPS URL |
| `MILLOIN_OWNER_EMAIL` | yes | Single Google account allowed to organize polls |
| `MILLOIN_SESSION_SECRET` | yes | HMAC secret for organizer session cookies; at least 32 random characters |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth Web client secret |
| `MILLOIN_OWNER_API_KEY` | optional | Bearer credential for the organizer's AI/API clients |
| `MILLOIN_STORAGE` | local/test | `memory` for process-local data; omit/use another value for Firestore |
| `GOOGLE_CLOUD_PROJECT` | local Firestore | Project used by the Firestore server client; supplied automatically in Cloud Run |
| `FIRESTORE_EMULATOR_HOST` | emulator only | Firestore emulator host, normally `127.0.0.1:8080` |

Generate secrets rather than inventing passwords, for example:

```bash
openssl rand -base64 48
```

## Tests

Fast checks:

```bash
npm run typecheck
npm test
npm run build
```

Browser lifecycle:

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright starts the app with an in-memory repository and a test organizer session. The same scenario runs in desktop Chromium and a mobile Pixel viewport.

Production container:

```bash
docker build -t milloin:local .
docker run --rm -p 8080:8080 milloin:local
curl --fail http://localhost:8080/api/health
```

GitHub Actions runs these gates automatically on pull requests. Do not merge a failed gate.

## REST API and discovery

Canonical API base:

```text
/api/v1
```

Machine-readable contract:

```text
/openapi.json
```

Standards-based API catalog:

```text
/.well-known/api-catalog
```

The public poll token authorizes reading a poll and creating a new participant response. The participant's private edit token authorizes only that participant. Organizer operations require the authenticated Google session or the owner API bearer credential.

The web UI is a client of the same application behavior. A programmable client never needs screen scraping.

## MCP

MCP endpoint:

```text
/mcp
```

Current tools:

```text
get_poll
create_poll
add_time_slots
remove_time_slot
submit_availability
update_availability
get_results
select_winner
close_poll
reopen_poll
```

`get_poll`, `get_results` and new participant submission work from the poll capability. Participant updates use the private edit capability. Organizer tools require the owner bearer credential in the HTTP `Authorization` header.

Example credential form:

```text
Authorization: Bearer <MILLOIN_OWNER_API_KEY>
```

Do not place this key in a shared MCP configuration or log it.

## Google Cloud infrastructure

Terraform is in `infra/terraform`. It expects an **existing billed Google Cloud project**; project creation and billing-account selection are intentionally outside Terraform.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# set project_id
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

The module creates the application foundation and protects Firestore, Secret Manager containers and Cloud Run from accidental Terraform deletion. Read `infra/terraform/README.md` before applying.

Terraform secret resources contain no secret payloads. Populate secret values separately.

## Production OAuth and secrets

After the first infrastructure apply, use the actual Cloud Run/public application URL as `MILLOIN_BASE_URL` and configure the Google OAuth Web client callback as:

```text
<MILLOIN_BASE_URL>/api/auth/google/callback
```

Populate these runtime values from Secret Manager/configuration rather than source code:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `MILLOIN_SESSION_SECRET`
- `MILLOIN_OWNER_EMAIL`
- optional `MILLOIN_OWNER_API_KEY`

The human Google session and the external owner API credential deliberately resolve to the same owner identity, so an authorized AI client can administer polls created through the UI.

## Production deployment

Production release workflow:

```text
.github/workflows/deploy-production.yml
```

It is manual and uses the GitHub `production` environment. GitHub authenticates to Google Cloud through Workload Identity Federation; there is no long-lived Google service-account key in GitHub.

Required GitHub environment/repository variables after Terraform apply:

```text
GCP_PROJECT_ID
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

A release:

1. builds an image tagged with the exact Git commit SHA;
2. pushes it to Artifact Registry;
3. deploys a zero-traffic Cloud Run candidate revision;
4. checks the candidate's `/api/health` directly;
5. moves production traffic only if the candidate passes.

### Rollback

Run `Deploy production` manually and provide `image_tag` equal to a previously deployed commit SHA. The old image goes through the same zero-traffic smoke test before traffic changes.

If a new candidate fails its health check, the workflow stops before production traffic moves.

## Production smoke test

Before declaring v1 live, issue #14 must pass against the real production URL and real Firestore. It covers:

- Google organizer sign-in;
- UI poll creation;
- participant voting and persistence after reload;
- private edit capability and invalid-token rejection;
- organizer management and finalization;
- ICS export;
- REST owner-agent workflow;
- MCP read/vote/results workflow;
- mobile viewport;
- expected unauthorized failures.

Until that is green, treat production as unfinished even if Cloud Run responds to `/api/health`.

## Data and recovery

Each poll is one Firestore aggregate under the `polls` collection. Deleting a poll intentionally deletes that aggregate.

For this personal service:

- prevent accidental infrastructure deletion first;
- configure a lightweight Firestore backup/export policy before relying on production data;
- do not promise recovery beyond the backup actually configured;
- capability URLs should be treated as secrets because possession grants the documented public/edit rights.

The backup implementation and operational alerting are tracked in issue #13.

## Troubleshooting

**Google says redirect URI mismatch**

Check `MILLOIN_BASE_URL` and the Google OAuth client's authorized callback. They must resolve to exactly:

```text
<MILLOIN_BASE_URL>/api/auth/google/callback
```

**Organizer gets rejected after Google login**

Check that the verified Google email exactly matches `MILLOIN_OWNER_EMAIL` after lowercasing.

**Firestore fails locally**

For emulator mode, confirm `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `GOOGLE_CLOUD_PROJECT=demo-milloin`, and that the emulator is running. For fast UI work, switch back to `MILLOIN_STORAGE=memory`.

**Cloud Run revision is unhealthy**

Inspect Cloud Run logs and `/api/health`. Do not shift traffic manually to an unhealthy candidate. Fix the revision or redeploy a known-good image SHA.

**Deployment cannot authenticate to GCP**

Compare GitHub's `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` variables with the Terraform outputs. The workload identity provider is restricted to `beckot/milloin`.

**Agent can read polls but cannot administer them**

Public operations do not imply organizer rights. Confirm the agent sends `Authorization: Bearer <MILLOIN_OWNER_API_KEY>` and that the deployed app has the same owner API key configured.

## Development rule

When changing behavior:

1. write the failing test;
2. implement the smallest robust change;
3. run typecheck/tests/build;
4. run browser/container coverage when the affected boundary warrants it;
5. merge only when CI is green.

Prefer the simpler option unless security, durability, API compatibility or operating cost justifies more machinery.

## License

MIT
