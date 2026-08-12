# Production acceptance

Issue #14 is the v1 go-live gate. Do not close it because Cloud Run merely answers `/api/health`; run the external lifecycle against the real service and real Firestore.

## Automated API + MCP smoke

From a trusted machine that has the private owner API credential:

```bash
export MILLOIN_PRODUCTION_URL='https://your-real-cloud-run-url'
export MILLOIN_OWNER_API_KEY='your-private-owner-key'
npm run test:production:api
```

The script creates disposable production data, checks the lifecycle, and deletes the test poll in a `finally` cleanup path. It does not print the owner key, poll token, participant edit token, or Authorization headers.

It covers:

- health and OpenAPI discovery;
- organizer REST credential;
- real Firestore write + fresh read;
- public participant response;
- valid and invalid private edit capability;
- a real MCP HTTP client performing `get_poll`, `submit_availability`, and `get_results`;
- winner selection and closed-write rejection;
- ICS content;
- reopen and delete.

## Automated mobile public UI

Install Chromium once if needed:

```bash
npx playwright install chromium
```

Then:

```bash
export MILLOIN_PRODUCTION_URL='https://your-real-cloud-run-url'
export MILLOIN_OWNER_API_KEY='your-private-owner-key'
npm run test:production:ui
```

This creates a disposable poll through the owner API, opens the real public UI with a Pixel-sized browser, votes, reloads to prove persistence, follows the private edit link, updates the response, verifies the update publicly, and cleans up the poll.

## Manual Google organizer check

Do not automate the real Google sign-in account through Playwright. Verify it manually against production:

1. Open `MILLOIN_PRODUCTION_URL/new` in a clean browser session.
2. Sign in with the allowlisted Google account.
3. Confirm the app returns from `/api/auth/google/callback` and lets you create a poll.
4. In a separate private/incognito session, attempt organizer access with a different Google account and confirm it is rejected.
5. Log out and confirm organizer operations require sign-in again.
6. Create one real temporary poll through the human UI.
7. Using your private owner API key, read/administer that same poll through REST or MCP. This proves human and agent credentials map to the same owner identity.
8. Delete the temporary poll.

## Unauthorized checks

Confirm at minimum:

- `POST /api/v1/polls` without organizer authorization returns 401;
- organizer operation with a wrong bearer key is rejected;
- a wrong participant edit token is rejected;
- a closed poll rejects new participant writes;
- deleted poll returns 404.

The automated API smoke covers all except the browser Google-account allowlist behavior.

## Evidence to record on issue #14

Record only non-sensitive evidence:

- exact deployed revision SHA/name;
- service URL;
- date/time of acceptance;
- automated API/MCP smoke: pass/fail;
- mobile public UI smoke: pass/fail;
- allowed Google sign-in: pass/fail;
- non-allowlisted Google sign-in: rejected/pass;
- no secrets observed in Actions/Cloud Run logs: pass/fail;
- any accepted deviations.

Never paste bearer keys, OAuth secrets, cookies, public poll capability URLs, or participant edit URLs into the issue.

When every check passes, update the README status from production-pending to live and close #10–#14 as appropriate.
