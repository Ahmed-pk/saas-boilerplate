---
name: saas-boilerplate
description: Rules and know-how for working in this SvelteKit SaaS boilerplate (Better Auth, MySQL, Polar/Freemius billing, one dashboard folder per plan). Its main job is to keep changes inside the dashboard plan folders (src/routes/dashboard/PLAN/, e.g. dashboard/basic/) and each route self-contained, and to stop before touching core files (auth, hooks, lib, checkout, layout, schema, config). Use this skill for ANY task in this repo or a project cloned from it, including adding or changing dashboard pages, forms, API endpoints, database queries, billing or account features, sidebar items or icons, styling, fixing bugs, or reviewing code, even if the user doesn't mention the boilerplate, and especially when a request seems to need a change outside the dashboard.
---

# SaaS boilerplate: working rules

This repo is a starter that is cloned for each SaaS product. The core (login, sessions, checkout, webhooks, plan access, sidebar) is finished and shared by every product. Product work happens in **dashboard pages**, and each page is written so that it can be read, changed or deleted without affecting any other page.

These rules come from the project owner. They keep juniors and AI from breaking auth or billing, and keep every page easy to change. They override your usual habits: don't refactor into shared helpers, don't "clean up" core files, even when it looks like an improvement.

## Rule 1: only edit inside the dashboard plan folders

You may create, edit and delete files **only** here:

```
src/routes/dashboard/<plan>/**      e.g. dashboard/free/, dashboard/basic/, dashboard/monthly/
static/dashboard-icons/             sidebar icons for those pages
```

Everything else is **core**. Read it to understand how things work; never change it:

```
src/routes/dashboard/+layout.server.js, +layout.svelte    sidebar, plan data, logout
src/routes/(auth)/**                                       login, signup, checkout, payment webhook
src/hooks.server.js, src/hooks.js                          sessions, dashboard + plan guards, URL rewriting
src/lib/**                                                 auth, database pool, Polar client, helpers
src/theme.css, src/routes/layout.css, src/app.html        colors, shared CSS classes, HTML shell
db/**, .env*, package.json, vite.config.js, svelte.config.js, .claude/**
```

Creating a new top-level plan folder (`dashboard/<new-plan>/`) is also core work: it must match a plan in the price list, so it's part of adding a plan.

**When a task needs a core change**, for example a new database table or column, a new npm package, a new env var, a new plan, changes to login or checkout, a new shared CSS class, or a fix in a core file:
1. Don't make it, and don't work around it (no copying core code into a route to modify it, no second database pool or Polar client, no new files under `src/lib/`).
2. Do whatever part of the task fits inside the plan folders.
3. Tell the user clearly: which core file needs what change and why, with the proposed code or SQL as a snippet in your reply. They'll pass it to the project lead.

If the user asks you directly to edit a core file, explain that core files are off limits for this skill and give them the proposed change to apply themselves or hand to the lead.

## Rule 2: every route is independent

A route is one folder containing a `+page.svelte`. Keep everything it needs inside that folder:

| File | Put here |
|---|---|
| `+page.svelte` | the page UI |
| `+page.server.js` | `load` (reading data) and `actions` (form submissions) for this page only |
| `+server.js` | JSON endpoints this page's own browser code calls (`GET`, `POST`, …) |
| `SomeName.svelte`, `something.js` (no `+`) | pieces used **only** by this route's files |

- **No sharing between routes.** Never import from another route's folder (not a sibling, not a parent, not another plan's copy). If two routes need the same code, copy it into both. Repetition is intended.
- **No reusable helper modules.** Don't create `utils.js`, `helpers/`, `components/` or anything under `src/lib/`. Small helper functions defined inside a route's own file are fine.
- **A sub-folder page is its own route** and follows the same rules; it doesn't import its parent's files.
- **Only these imports may come from outside the route folder:**

| Import | What for |
|---|---|
| `@sveltejs/kit` (`fail`, `redirect`, `error`, `json`) | responses |
| `$app/forms`, `$app/state`, `$app/navigation` | forms, current page, navigation |
| `$env/dynamic/private` | server-side env vars (only existing ones) |
| `import { db } from '$lib/server/db.js'` | MySQL queries |
| `import { auth } from '$lib/server/auth.js'` | `auth.api.*` calls (account features) |
| `import { polar } from '$lib/server/polar.js'` | Polar API calls (billing features) |
| `import { authClient } from '$lib/auth-client.js'` | browser-side auth calls |
| `import { plans } from '<../ as needed>(auth)/checkout/polar.js'` | the plan price list (read only) |
| packages already in `package.json` | anything else |

## How the dashboard works (what core gives you)

- **One dashboard per plan.** Each signed-in user sees exactly one folder: `dashboard/basic/` for Basic subscribers, `dashboard/monthly/` for Monthly, `dashboard/free/` for users without an active subscription. `src/hooks.server.js` redirects everyone else away from a plan folder, for pages, form actions and endpoints alike. So you never write access checks for the plan in a route.
- **In every dashboard route's server code:** `locals.user` (always set: `id`, `name`, `email`), `locals.plan` (`'free'`, `'basic'`, …), `locals.subscription` (the DB row or null).
- **In every dashboard page's `data`:** `data.user`, `data.subscription`, `data.base` (the plan's URL, e.g. `/dashboard/basic`) from the layout, plus whatever your own `load` returns.
- **A feature for several plans = a copy in each plan folder.** Copies may then differ per plan.
- **Folder names:** `<number>-<name>`. The number sets the sidebar order and is invisible elsewhere. `dashboard/basic/2-projects/` is served at `/dashboard/basic/projects`, labelled "Projects". No number means it sorts last. A `+page.svelte` is required for the page to exist and to appear in the sidebar.
- **Icons:** `static/dashboard-icons/<name>.svg` (or `.png`), named by the path inside the plan folder without numbers, with dots for nesting: `projects.svg`, `projects.archive.svg`. All plans share them. Restart the dev server if a new icon doesn't show.
- **URLs:** the same page exists under several plans, so never hard-code `/dashboard/basic/...`. Use `data.base` in pages (`href="{data.base}/projects"`) and `url.pathname` in server code.
- **Styling:** Tailwind utilities plus the shared classes `.input`, `.btn`, `.btn-primary`, `.btn-danger`, `.card`, `.link`, and brand colors `bg-primary`, `text-primary`, `bg-primary-soft`, `text-primary-fg` (same with `secondary`). Use them; don't restyle buttons per page.

## Writing route code

**Reading data**: `load` in `+page.server.js`, always scoped to the signed-in user:
```js
import { db } from '$lib/server/db.js';

export async function load({ locals }) {
	const [projects] = await db.execute('SELECT id, name FROM project WHERE user_id = ? ORDER BY id DESC', [locals.user.id]);
	return { projects };
}
```

**Changing data**: form actions + `use:enhance`. Validate input, return `fail(400, { error })` or `{ success }`:
```js
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';

export const actions = {
	create: async ({ request, locals }) => {
		const name = (await request.formData()).get('name')?.toString().trim();
		if (!name) return fail(400, { error: 'Name is required.' });
		await db.execute('INSERT INTO project (user_id, name) VALUES (?, ?)', [locals.user.id, name]);
		return { success: 'Project created.' };
	}
};
```
```svelte
<form method="POST" action="?/create" use:enhance>…</form>
{#if form?.error}<p class="text-sm text-red-600">{form.error}</p>{/if}
```
Leave out `use:enhance` only when the action redirects to another website (e.g. Polar's portal, SSO linking).

**JSON for this page's own scripts**: `+server.js` next to `+page.svelte`. Browser page loads go to the page; `fetch` calls with `accept: application/json` go to the endpoint:
```js
// +server.js
import { json } from '@sveltejs/kit';
export async function GET({ locals }) { return json({ plan: locals.plan }); }
```
```js
// in +page.svelte
const res = await fetch(page.url.pathname, { headers: { accept: 'application/json' } });
```

The existing account (`2-account/`) and billing (`3-billing/`) pages are full examples of this style, including a route-local `run()` helper for Better Auth calls and Polar subscription actions. `references/core.md` explains what they rely on.

## Security rules for route code

- **Scope every query by `locals.user.id`.** Never trust a user ID, subscription ID or row ID from the form or URL without checking it belongs to `locals.user.id`, e.g. `WHERE id = ? AND user_id = ?`.
- **Always use `?` placeholders** in SQL, never string concatenation. The `user` table needs backticks: `` `user` ``.
- **Never return secrets to the browser.** Don't return `auth.api.*` responses (they can contain session tokens), tokens, or whole DB rows with private columns. Return only the fields the page shows.
- **Billing:** look up the user's own subscription server-side (`SELECT external_id FROM subscription WHERE user_id = ?`) before any Polar call.
- **No redirects to URLs taken from user input.**

## Before saying it's done

1. Every changed file is inside the allowed zone (Rule 1), and nothing imports from another route (Rule 2).
2. If the feature is meant for several plans, every plan folder has its own copy.
3. `npx vite build` passes.
4. You tried it as a user on each affected plan. `references/testing.md` explains how, without touching real data: a throwaway database, reading login codes, switching a test user's plan.
5. Your summary lists any core changes the task still needs (Rule 1), so the user can pass them on.

## Reference files (read, don't edit what they describe)

- `references/core.md`: how the core works (auth, checkout, webhooks, plan guard, billing and account internals) and how core changes are done. Read it to understand behaviour or to write a precise core-change proposal.
- `references/apis.md`: verified Better Auth, Polar and Freemius API details. Read before calling `auth.api.*` or `polar.*` from a route; several names and fields are not what you'd guess.
- `references/testing.md`: local testing recipes. `scripts/polar-webhook.mjs` sends a signed test webhook.
