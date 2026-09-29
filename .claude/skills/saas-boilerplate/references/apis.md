# Verified API notes

Checked against the installed packages' type definitions: better-auth 1.7, @polar-sh/sdk 1.0 (API version `2026-10`), @freemius/sdk 0.5. If `package.json` shows newer major versions, re-check in `node_modules/<pkg>/dist/*.d.mts` before relying on these.

## Contents
- Better Auth: server API, email OTP, config options, errors
- Polar: client, checkout, subscriptions, portal, webhooks
- Freemius: client, checkout, webhooks, purchases
- MySQL / mysql2

---

## Better Auth

### Server calls (`auth.api.*`, always pass `headers: request.headers`)
| Call | Body | Notes |
|---|---|---|
| `getSession({ headers })` | – | `{ user, session } \| null`; used in hooks |
| `updateUser` | `{ name, image? }` | |
| `changePassword` | `{ currentPassword, newPassword, revokeOtherSessions? }` | returns a new token: never send to browser |
| `setPassword` | `{ newPassword }` | server-only; for accounts without a password; needs a fresh session |
| `listUserAccounts` | – | `[{ id, providerId, accountId, scopes }]`; password login is `providerId: 'credential'` |
| `linkSocialAccount` | `{ provider, callbackURL }` | returns `{ url, redirect }`; redirect the browser to `url` |
| `unlinkAccount` | `{ accountId }` | **`accountId` is the account row's `id`**, not the provider's account id. Refuses to remove the last login method |
| `listSessions` | – | includes `token`: keep server-side |
| `revokeSession` | `{ token }` | |
| `revokeOtherSessions` | – | |
| `deleteUser` | `{ password? }` | needs `user.deleteUser.enabled`; without password needs a session younger than `freshAge` (1 day), else throws code `SESSION_EXPIRED` |
| `requestEmailChangeEmailOTP` | `{ newEmail }` | needs `emailOTP({ changeEmail: { enabled: true } })`; sends type `'change-email'` code to the new address |
| `changeEmailEmailOTP` | `{ newEmail, otp }` | |

Errors thrown by `auth.api.*` are `APIError`s: use `e.body?.message` and `e.body?.code` (e.g. `INVALID_PASSWORD`, `EMAIL_NOT_VERIFIED`, `SESSION_EXPIRED`, `INVALID_ORIGIN`). Errors without `.body` came from your own hook code (e.g. a Polar call in `beforeDelete`).

### Browser client (`authClient`)
`signIn.social({ provider, callbackURL })`, `signIn.email({ email, password })`, `signUp.email({ name, email, password })`, `signIn.emailOtp({ email, otp, name? })` (creates the user if new), `emailOtp.sendVerificationOtp({ email, type: 'sign-in' })`, `emailOtp.verifyEmail({ email, otp })`, `signOut()`. Each returns `{ data, error }`; `error.code === 'EMAIL_NOT_VERIFIED'` after a password login means Better Auth just emailed a fresh code (because of `sendOnSignIn: true`).

### Config facts that matter here
- `emailOTP({ overrideDefaultEmailVerification: true })` replaces verification links with codes; don't also set `sendVerificationOnSignUp`.
- `emailVerification.autoSignInAfterVerification: true` makes `verifyEmail` create the session.
- OTP defaults: 6 digits, 5 minutes, 3 attempts, stored **plain** in `verification.value` as `"<code>:<attempts>"`, identifier `"<type>-otp-<email>"` (change-email: `"change-email-otp-<old>-<new>"`).
- `svelteKitHandler` / `isAuthPath` only matches when the request origin equals `baseURL`'s origin. It fails behind a tunnel (http vs https), which is why hooks route `/api/auth/` by path.
- `sveltekitCookies(getRequestEvent)` must be the **last** plugin.
- `baseURL` may also be `{ allowedHosts: [...], fallback, protocol }` for multi-domain setups; `advanced.trustedProxyHeaders` makes it honour `x-forwarded-*`.

---

## Polar (`@polar-sh/sdk/2026-10`)

All request and response fields are **snake_case**. Client: `createPolar({ accessToken, environment: 'sandbox' | 'production' })` in `$lib/server/polar.js`. Sandbox and production have separate tokens and products.

### Checkout
```js
polar.checkouts.create({
  products: [productId],          // UUIDs; a non-UUID gives 422 uuid_parsing
  external_customer_id: user.id,  // links the order/subscription to our user
  customer_email, customer_name,
  success_url, return_url         // absolute URLs; build from env.BETTER_AUTH_URL
}) // → { url, ... }
```

### Subscriptions
- `subscriptions.get(id)` → `{ id, status, product_id, product: { name, prices }, amount (cents), currency, recurring_interval, current_period_end, cancel_at_period_end, ends_at, pending_update: { product_id, applies_at } | null, customer: { external_id, email } }`
- `status`: `incomplete | incomplete_expired | trialing | active | past_due | canceled | unpaid | paused`. While canceled-at-period-end, status stays `active` until the period ends; `canceled` means it's over.
- `subscriptions.update(id, body)`: body is one of:
  - `{ product_id, proration_behavior }` with `proration_behavior`: `'invoice'` (charge difference now), `'prorate'` (on next invoice), `'next_period'` (schedule the change → `pending_update`), `'reset'`
  - `{ cancel_at_period_end: true|false, customer_cancellation_reason?, customer_cancellation_comment? }`; reasons: `customer_service | low_quality | missing_features | switched_service | too_complex | too_expensive | unused | other`
  - `{ pending_update: null }`: drop a scheduled change
  - `{ revoke: true }` or `subscriptions.revoke(id)`: end immediately
  - also `{ pause_at_period_end }`, `{ resume: true }`, `{ seats }`, `{ current_billing_period_end }`
- `products.get(id)` → `{ name, recurring_interval, prices: [{ amount_type: 'fixed', price_amount, price_currency, is_archived }, ...] }`

### Customer portal
`customerSessions.create({ external_customer_id, return_url })` → `{ customer_portal_url }`. Fails if the user never became a Polar customer.

### Webhooks
```js
import { webhooks } from '@polar-sh/sdk/2026-10';
const event = await webhooks.validateEvent(rawBodyText, Object.fromEntries(request.headers), env.POLAR_WEBHOOK_SECRET);
```
Throws `webhooks.PolarWebhookVerificationError` (→ 403) or `webhooks.PolarWebhookUnknownTypeError` (→ 202, ignore). Standard Webhooks signing: headers `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64 HMAC-SHA256 of "id.timestamp.body">`, key = base64-decoded part after `whsec_`. Every `subscription.*` event carries the full current subscription in `event.data`. The SDK also has webhook-endpoint CRUD (`services/webhooks`: create/update/list), which is useful for auto-registering a tunnel URL.

---

## Freemius (`@freemius/sdk`)

- `new Freemius({ productId: Number, apiKey, secretKey, publicKey })` **throws at construction if `productId` is NaN**, so create it lazily (the build imports server modules without env vars).
- Checkout: `(await freemius.checkout.create({ planId, isSandbox })).setUser({ email, name }, true).getLink()`. The `true` locks the email. No success-URL option; set the redirect in the Freemius dashboard.
- Webhooks: `const l = freemius.webhook.createListener(); l.on([...events], handler); return freemius.webhook.processFetch(l, request)` verifies the signature and returns a `Response`. License events: `license.created | extended | shortened | plan.changed | updated | expired | cancelled | deleted`; subscription events: `subscription.created | cancelled | renewal.failed | renewal.failed.last`. Handlers get `{ objects: { license, user? }, data }`.
- `freemius.purchase.retrievePurchase(licenseId)` → `{ email, planId, licenseId, expiration: Date|null, canceled, subscriptionId, billingCycle, ... }`. Re-read it in webhook handlers so the stored state is always current.
- Freemius is license-based; a "lifetime" plan arrives as license events, not subscription events.

---

## MySQL / mysql2

- `mysql.createPool({ uri })`; `db.execute(sql, params)` returns `[rows, fields]`, so single rows are `const [[row]] = await db.execute(...)`. Passing `undefined` as a param throws; use `null`.
- Upsert with a row alias (MySQL 8.0.19+): `INSERT ... VALUES (...) AS new ON DUPLICATE KEY UPDATE col = new.col` (`VALUES()` in the update clause is deprecated).
- Better Auth's column types for MySQL: ids and foreign keys `VARCHAR(36)`, unique/indexed strings `VARCHAR(255)`, other strings `TEXT`, dates `TIMESTAMP(3)`, booleans `BOOLEAN`. Column names are camelCase (`emailVerified`, `userId`). `db/schema.sql` matches Better Auth's own migration check (`getMigrations` reports nothing to add); re-verify after enabling a plugin that adds tables.
- Special characters in the `DATABASE_URL` password must be URL-encoded (`@` → `%40`).
