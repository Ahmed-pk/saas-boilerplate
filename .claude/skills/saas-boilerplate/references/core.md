# Core reference

How the parts outside the dashboard plan folders work. These files are **core**: under the working rules in SKILL.md, AI and junior developers don't edit them. Use this file to understand behaviour, to debug, and to write an exact change proposal for the project lead. The recipes below are what the lead follows when making a core change.

## Contents
- Stack
- Project map
- How the main flows work
- Core change recipes (for the project lead)
- Core security rules
- Environment and running it

## Stack

| Concern | Choice | Where |
|---|---|---|
| Framework | SvelteKit 2, Svelte 5 runes, Vite, plain JS (no TS) | `src/` |
| Styling | Tailwind v4 (CSS-first config) | `src/theme.css`, `src/routes/layout.css` |
| Auth | Better Auth + `emailOTP` plugin, Google + LinkedIn | `src/lib/server/auth.js`, `src/hooks.server.js` |
| Database | MySQL 8 via `mysql2/promise`, no ORM | `src/lib/server/db.js`, `db/schema.sql` |
| Email | SMTP via `nodemailer` | inside `src/lib/server/auth.js` |
| Payments | Polar (default) **or** Freemius, one per project | `src/routes/(auth)/checkout/` |

## Project map

```
db/schema.sql                    Better Auth tables (user, session, account, verification) + subscription
db/import.js                     `npm run db:import`: creates the DB from DATABASE_URL, runs schema.sql (re-runnable)
.env.example                     every env var, with the SSO callback and webhook URLs to register
src/theme.css                    brand colors (primary/secondary); edit here only
src/hooks.server.js              session → locals, /dashboard login guard + plan guard, routes /api/auth/* to Better Auth
src/hooks.js                     reroute: serves /dashboard/basic/account from the numbered folder dashboard/basic/2-account
src/lib/route-order.js           withoutOrder(): strips the "2-" sort prefix from dashboard paths
src/lib/server/auth.js           Better Auth config, SMTP sender, deleteUser.beforeDelete (revokes Polar sub)
src/lib/server/db.js             one mysql2 pool for everything
src/lib/server/polar.js          one Polar client (checkout, billing, account deletion)
src/lib/auth-client.js           browser auth client (used by AuthForm and the dashboard logout)
src/routes/layout.css            imports Tailwind + theme, shared classes: .input .btn .btn-primary .btn-danger .card .link
src/routes/(auth)/               public pages; "(auth)" is a route group, so URLs are /login /signup /checkout
  AuthForm.svelte                one form for login, signup and checkout: SSO, email code, or password
  login/, signup/                +page.server.js redirects signed-in users to a safe ?redirect= path
  checkout/+page.server.js       validates ?plan=, signed in → redirect to payment, else show AuthForm
  checkout/polar.js              `plans` map + checkoutUrl() + handleWebhook()   ← active provider
  checkout/freemius.js           same exports for Freemius
  checkout/webhook/+server.js    POST /checkout/webhook → provider's handleWebhook → save() upserts `subscription`
src/routes/dashboard/            protected by hooks.server.js; one complete dashboard per plan
  +layout.server.js              sidebar = pages inside the user's plan folder; icons, user, subscription row
  +layout.svelte                 sidebar + user footer + logout (shared by every plan)
  free/                          /dashboard/free/...: signed-up users without an active subscription
    +page.svelte                 free home (points to billing to subscribe)
    2-account/, 3-billing/       copies; billing with no subscription lists the plans with Subscribe buttons
  basic/                         /dashboard/basic/...: Basic subscribers only (folder name = plan slug)
    +page.svelte                 the plan's dashboard home
    1-invoices/                  placeholder page
    2-account/                   actions: updateName, requestEmailChange, confirmEmailChange, changePassword,
                                 setPassword, link, unlink, revokeSession, revokeOtherSessions, deleteAccount
    3-billing/                   live Polar data; actions: changePlan, keepPlan, cancel, resume, portal
  monthly/                       same pages, copied (repetition is intended: each plan's pages can diverge freely)
static/dashboard-icons/          sidebar icons, named by the path inside the plan folder with dots: account.svg,
                                 account.settings.svg; shared by all plans
```

## How the main flows work

**Auth.** `hooks.server.js` loads the session on every request into `locals.user` / `locals.session`, redirects logged-out `/dashboard*` requests to `/login?redirect=…`, and sends any path starting with `/api/auth/` to `auth.handler`. Email/password accounts must verify their email, and verification uses the same 6-digit OTP as code login (`overrideDefaultEmailVerification`), never a link. The browser talks to Better Auth through `authClient` in `AuthForm.svelte`. Everything on the account page goes through server actions calling `auth.api.*` with `headers: request.headers`; the `sveltekitCookies` plugin (must stay the last plugin) lets those calls set cookies.

**Checkout.** The marketing site links to `/checkout?plan=<slug>`. If the user isn't signed in, `AuthForm` (email code by default) signs them in and returns to the same URL. If they already have a live subscription (a `subscription` row whose status isn't `canceled`, `expired` or `incomplete_expired`), they're sent to `/dashboard` instead, because a second checkout would create a second subscription; plan changes belong on the billing page. Otherwise `checkoutUrl()` creates the provider checkout and redirects. Polar gets `external_customer_id = user.id`, so webhooks map straight back to the user. Freemius only knows the email, so its checkout locks the email field and the webhook matches by email.

**One dashboard per plan.** Every dashboard page lives inside a plan folder named after a plan slug from `plans`: `dashboard/basic/...` is the whole dashboard for Basic subscribers, `dashboard/monthly/...` for Monthly. Pages are deliberately copied between plan folders so each plan's version can change on its own. `hooks.server.js` loads the subscription row for every `/dashboard` request into `locals.subscription` and sets `locals.plan` (the slug, or null when there is no row or its status is `canceled`, `expired` or `incomplete_expired`). Users without an active subscription get `locals.plan = 'free'` and the `dashboard/free/` folder, so every signed-in user has exactly one folder. Hooks then redirect `/dashboard` and any other plan's folder (including `free/` for subscribers) to `/dashboard/<locals.plan>`. `free` is reserved: never use it as a paid plan's slug. When a subscription ends, the user falls back to `free/` automatically. Because this is in hooks, it covers pages, form actions, `+server.js` endpoints and in-app navigation. The check uses `withoutOrder(url.pathname)` so numbered URLs can't bypass it. The sidebar lists only the pages inside the user's plan folder, and the "Dashboard" heading links to the plan home. There is no `dashboard/+page.svelte`; `/dashboard` only redirects.

**Links inside plan pages.** Since the same page exists at `/dashboard/basic/account` and `/dashboard/monthly/account`, never hard-code a dashboard URL in a plan page. Build return URLs from the request (`url.pathname`, as the SSO-link and billing-portal actions do), or from `data.base` (`/dashboard/<plan>`) in components under the dashboard layout.

**Subscription state.** Webhooks upsert one row per user in `subscription` (`plan`, `status`, `current_period_end`, `external_id`). The dashboard layout reads that row (the sidebar shows "Plan · status"). The billing page reads **live from Polar** instead, so a cancel or plan change shows immediately rather than after the webhook arrives.

**Billing actions.** These are always resolved from the signed-in user's own `subscription.external_id` looked up server-side, never from an ID posted by the form. Upgrade uses `proration_behavior: 'invoice'` (switch now, charge the difference). Downgrade uses `'next_period'`, which schedules a `pending_update` that the page shows with a "Keep current plan" button (`{ pending_update: null }`). Cancel is `cancel_at_period_end: true`, with an optional reason. Card, address, tax ID and invoices go to Polar's hosted portal via `customerSessions.create({ external_customer_id })`.

**Account deletion.** `deleteUser` requires the password (if the account has one) or a session younger than a day. `beforeDelete` in `auth.js` revokes the Polar subscription first; if Polar throws, deletion is aborted, so a deleted account is never still being charged.

## Core change recipes (for the project lead)

### Add or change a plan
Edit `plans` at the top of the active provider file (`checkout/polar.js` by default): `slug: '<Polar product UUID>'`. Every plan needs its own dashboard folder, `src/routes/dashboard/<slug>/`, with at least a `+page.svelte` (copy an existing plan folder as a start); the folder name must equal the slug, and without it subscribers are redirected to a page that doesn't exist. Renaming a slug means renaming its folder too (and existing `subscription.plan` values). The slug is what goes in `/checkout?plan=slug`. The billing page lists these plans in this order and loads names and prices from Polar. Sandbox and production products differ, so the ID must match `POLAR_SANDBOX`.

### Switch payment provider (Polar ↔ Freemius)
1. Change the import in `checkout/+page.server.js` (`./polar.js` → `./freemius.js`) and in `checkout/webhook/+server.js` (`../polar.js` → `../freemius.js`). `plans` is also imported by `src/hooks.server.js` and each plan's `3-billing/+page.server.js` (including `free/`); find them all with a search for `checkout/polar.js`.
2. Put plan IDs in the new file (Polar: product UUIDs; Freemius: numeric plan IDs as strings).
3. Fill that provider's env vars; register `{BETTER_AUTH_URL}/checkout/webhook` in its dashboard. For Freemius, also set "redirect after purchase" to `/dashboard` in its dashboard (the SDK has no per-checkout success URL).
4. The billing page and `deleteUser.beforeDelete` are Polar-specific. For Freemius they need their Freemius equivalents (see `references/apis.md`).

### Add an SSO provider
Add it to `socialProviders` in `auth.js` with env vars, add a button in `AuthForm.svelte` (`social('<id>')`), add the id to `providers` and a display name to `providerNames` on the account page, and document the callback URL (`{BETTER_AUTH_URL}/api/auth/callback/<id>`) in `.env.example`.

### Add a table
Append `CREATE TABLE IF NOT EXISTS …` to `db/schema.sql` (reference ``user`(id)`` with `ON DELETE CASCADE` if it belongs to a user), then run `npm run db:import`. The import never alters existing tables, so for a new column on an existing table write an `ALTER TABLE` and tell the user to run it. Query with `db.execute(sql, params)` and always use placeholders. The `user` table name needs backticks in SQL.

### Change brand colors
Edit the base colors in `src/theme.css`; hover and soft shades are derived with `color-mix`. Use `bg-primary`, `hover:bg-primary-hover`, `text-primary`, `bg-primary-soft`, `text-primary-fg` (and `secondary-*`). Prefer the shared classes (`.btn-primary`, `.input`, `.card`, `.link`) over re-styling buttons per page.

## Core security rules

- **Keep the dashboard guard in `hooks.server.js`.** A layout `load` doesn't run for form actions or `+server.js` endpoints, so a layout-only guard would leave them open.
- **Never send `auth.api.*` responses to the browser.** Several return session tokens. Actions return only messages and fields you choose, which is what `run()` enforces. Session lists go to the page as IDs; tokens are looked up server-side when revoking.
- **Never trust IDs from forms for billing.** Look up the user's own subscription by `locals.user.id`.
- **Validate redirect targets.** The login and signup pages only accept `?redirect=` values matching `/^\/(?![/\\])/` (blocks `//evil.com` and `/\evil.com`).
- **Validate plan slugs with `Object.hasOwn(plans, slug)`**, not `plans[slug]` (`constructor` would pass).
- **Verify webhook signatures before doing anything** (the SDKs' `validateEvent` / `processFetch` already do this). Respond 403 on a bad signature and 2xx for events you ignore.

## Environment and running it

- `cp .env.example .env`, fill it in, then `npm run db:import` and `npm run dev`.
- `$env/dynamic/private` is used everywhere so builds work without env vars. Any SDK that throws on missing config at import time must be created lazily (see the `freemius()` getter).
- **`BETTER_AUTH_URL` is the single public origin.** Better Auth rejects requests whose `Origin` doesn't match it ("Invalid origin", 403), and cookies are per host. Browse the app only through that origin.
- **Behind a tunnel** (`cloudflared` → `http://localhost:5173`): set `BETTER_AUTH_URL=https://<tunnel-domain>`, add the domain to `server.allowedHosts` in `vite.config.js`, and build absolute URLs from `env.BETTER_AUTH_URL`, never `url.origin`. Vite sees the request as `http://`, so `url.origin` is wrong there. This is also why hooks route `/api/auth/*` by path instead of using Better Auth's `svelteKitHandler`, which compares origins and returned 404 behind the tunnel.
