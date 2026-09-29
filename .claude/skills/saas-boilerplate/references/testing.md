# Testing recipes

The goal is to prove a change works end to end without touching the user's real database, sending real emails, or charging anyone. Clean up everything you start.

## Contents
- Isolated test server (throwaway MySQL + second dev server)
- Logging in without email (reading OTP codes)
- Switching a test user's plan
- Webhooks
- Tunnel / custom-domain behaviour
- What can't be tested locally

---

## Isolated test server

The user usually has their own `npm run dev` on 5173 with a real `.env`. Leave it alone and start a second stack.

**1. Throwaway MySQL on port 3307** (Windows paths shown; MySQL data dirs fail on very long paths, so use a short temp folder):
```bash
D="$TEMP/sb-mysql"
"/c/Program Files/MySQL/MySQL Server 8.4/bin/mysqld" --no-defaults --initialize-insecure --datadir="$D"
"/c/Program Files/MySQL/MySQL Server 8.4/bin/mysqld" --no-defaults --datadir="$D" --port=3307 --mysqlx=OFF --bind-address=127.0.0.1 --console   # run in background
```

**2. Schema:** process env wins over `--env-file`, so this imports into the test DB:
```bash
DATABASE_URL="mysql://root@127.0.0.1:3307/saas_test" node --env-file=.env db/import.js
```

**3. Test dev server on another port.** Env vars set on the command line override `.env` for `$env/dynamic/private`:
```bash
DATABASE_URL="mysql://root@127.0.0.1:3307/saas_test" BETTER_AUTH_URL="http://localhost:5181" \
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 npx vite dev --port 5181 --strictPort          # run in background
```
Pointing SMTP at a closed port means no real email is sent; the failure is only logged. Polar calls still use the user's sandbox token from `.env`, so keep them read-only (`products.get`, `subscriptions.get`) unless the user agrees.

**4. Cleanup:** stop both background tasks, then kill anything still listening (npx can leave the child process running), and delete the data folder:
```bash
for port in 5181 3307; do PID=$(netstat -ano | grep "[:.]$port " | grep LISTEN | awk '{print $NF}' | head -1); [ -n "$PID" ] && taskkill //PID $PID //F; done
rm -rf "$TEMP/sb-mysql"
```

Check the schema still matches what Better Auth expects (after upgrading it or adding a plugin):
```js
import mysql from 'mysql2/promise';
import { getMigrations } from 'better-auth/db/migration';
import { emailOTP } from 'better-auth/plugins/email-otp';
const db = mysql.createPool({ uri: 'mysql://root@127.0.0.1:3307/saas_test' });
const { toBeCreated, toBeAdded } = await getMigrations({ database: db, emailAndPassword: { enabled: true }, plugins: [emailOTP({ sendVerificationOTP: async () => {} })] });
console.log(toBeCreated.map((t) => t.table), toBeAdded.map((t) => [t.table, Object.keys(t.fields)]));  // both should be empty
```
Run it from the project root (so imports resolve), e.g. as a temporary `.mjs` file you delete afterwards.

## Logging in without email

OTP codes are stored in plain text, so read them straight from the test DB after clicking "Email me a code":
```sql
SELECT identifier, SUBSTRING_INDEX(value, ':', 1) AS code FROM verification ORDER BY createdAt DESC LIMIT 3;
```
Identifiers: `sign-in-otp-<email>`, `email-verification-otp-<email>`, `change-email-otp-<old>-<new>`. Three wrong attempts invalidate a code.

A second "device" for session tests (a different User-Agent shows up as a separate device):
```bash
curl -H "Origin: http://localhost:5181" -H "content-type: application/json" -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1" \
  -d '{"email":"test@example.com","password":"..."}' http://localhost:5181/api/auth/sign-in/email
```

In the browser pane, `form_input` + clicking by `ref` is more reliable than typing when the pane isn't visible. Read results with `get_page_text` or a short `javascript_exec` (the accessibility reader drops text inside `<b>`).

## Switching a test user's plan

Which dashboard folder a user gets comes only from their row in `subscription`. In the **throwaway test database** (never the user's real one), set it directly:
```sql
-- Put test@example.com on Basic (use the plan slug = folder name)
DELETE FROM subscription WHERE user_id = (SELECT id FROM `user` WHERE email = 'test@example.com');
INSERT INTO subscription (user_id, plan, status, external_id)
  SELECT id, 'basic', 'active', 'test-fake-id' FROM `user` WHERE email = 'test@example.com';

-- Back to free: delete the row (or set status = 'canceled')
DELETE FROM subscription WHERE user_id = (SELECT id FROM `user` WHERE email = 'test@example.com');
```
Reload `/dashboard`; it redirects to the plan's folder. Pages that call Polar with the subscription ID (billing) fail with a fake ID; test those after a real sandbox checkout instead.

## Webhooks

Send signed Polar webhooks with the bundled script (the server and script must share `POLAR_WEBHOOK_SECRET`; for the test server, pass a made-up `whsec_<base64>` to both):
```bash
WEBHOOK_URL=http://localhost:5181/checkout/webhook node --env-file=.env .claude/skills/saas-boilerplate/scripts/polar-webhook.mjs <userId> active <productId>
BAD_SIGNATURE=1 WEBHOOK_URL=... node ... <userId>        # expect 403
```
Expect `202` and a row in `subscription`; sending again must update the same row (one row per user). Use a product ID from `plans` to see the slug stored; an unknown one is stored as the raw ID.

The Freemius handler re-reads the purchase from Freemius's API, so fake events can't be tested locally; use the Freemius sandbox.

Testing "Polar fails" paths: insert a subscription row with a fake, non-v4 UUID (`00000000-0000-0000-0000-000000000000`). Polar answers 422, which exercises the error handling (e.g. account deletion must be refused and the user kept).

## Tunnel / custom-domain behaviour

Simulate a request arriving through a Cloudflare tunnel without the tunnel:
```bash
curl -H "Host: <tunnel-domain>" -H "X-Forwarded-Proto: https" -H "Origin: https://<tunnel-domain>" ... http://localhost:5173/api/auth/ok
```
`/api/auth/ok` → `{"ok":true}` means routing works. For the origin check, POST `/api/auth/sign-in/email` with a made-up account: `401 INVALID_EMAIL_OR_PASSWORD` = origin accepted; `403 INVALID_ORIGIN` = `BETTER_AUTH_URL` doesn't match; `404` = the request never reached Better Auth.

## What can't be tested locally

- Real Polar checkout and payment, and actions on a real subscription (change plan, cancel, resume, portal): need a sandbox purchase. Ask the user to run them, or ask before using their sandbox.
- Google / LinkedIn sign-in and account linking: need real client IDs and a registered callback URL.
- Actual email delivery: check the dev server output for SMTP errors; the API responds 200 even when sending fails.

Say clearly in the summary which of these weren't exercised.
