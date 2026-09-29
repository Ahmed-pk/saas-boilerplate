# SaaS Boilerplate

A SvelteKit starter for SaaS products. Login, payments, plans and the dashboard shell are already built. **Your job is to build the product's pages inside the dashboard.** This guide explains how, and which files you must never touch.

- **Stack:** SvelteKit 2 + Svelte 5, Tailwind CSS 4, MySQL, Better Auth (login), Polar (payments)
- **Language:** plain JavaScript, no TypeScript

---

## 1. Setup

You need **Node.js 20+** and **MySQL 8** running locally.

```bash
npm install
cp .env.example .env
```

Fill in `.env`. Ask your lead for the values you don't have (SMTP login, Polar sandbox token). Then create the database tables and start the app:

```bash
npm run db:import
npm run dev
```

Open http://localhost:5173/signup and create an account. The quickest way is "Email me a code": you'll receive a 6-digit login code by email.

> Never commit `.env`, and never put real passwords or tokens in `.env.example`. That file is shared with everyone.

---

## 2. The golden rule: where you may work

You only create and edit files in these two places:

```
src/routes/dashboard/<plan>/     the dashboard pages (free/, basic/, monthly/, ...)
static/dashboard-icons/          icons for the sidebar
```

**Everything else is "core". Don't edit it**, even to fix a small thing:

| Core area | What it does |
|---|---|
| `src/routes/(auth)/` | login, signup, checkout, payment webhook |
| `src/routes/dashboard/+layout.*` | sidebar, plan data, logout |
| `src/hooks.server.js`, `src/hooks.js` | sessions, who can open which dashboard, clean URLs |
| `src/lib/` | login system, database connection, Polar client |
| `src/theme.css`, `src/routes/layout.css` | brand colors and shared CSS classes |
| `db/`, `.env*`, `package.json`, config files | database schema, settings, packages |

**Need something in core?** A new database table or column, a new npm package, a new setting, a change to login or payments: **ask your lead.** Describe what you need and why (a snippet of the change helps). Don't work around it by copying core code into your page.

The same rules apply to AI tools. Claude Code reads `.claude/skills/saas-boilerplate/SKILL.md` and follows them. If the AI says a task needs a core change, pass its proposal on to your lead.

---

## 3. How the dashboard works

**Every plan has its own complete dashboard folder:**

```
src/routes/dashboard/
  free/        users who signed up but haven't paid
  basic/       users on the Basic plan
  monthly/     users on the Monthly plan
```

- A user only ever sees **their own plan's folder**. Visiting `/dashboard` takes them there automatically.
- Opening another plan's pages just redirects them back. **You never write plan checks yourself**; the core does it for pages, forms and API endpoints.
- When someone subscribes, upgrades or cancels, they're moved to the right folder automatically.

**A feature for several plans?** Put a copy of the page in each plan's folder. Yes, copies. Every plan can then change its version without affecting the others.

### Folder names = sidebar

```
dashboard/basic/
  +page.svelte          → /dashboard/basic             (the plan's home page)
  1-invoices/           → /dashboard/basic/invoices    sidebar item 1: "Invoices"
  2-account/            → /dashboard/basic/account     sidebar item 2: "Account"
  3-billing/            → /dashboard/basic/billing     sidebar item 3: "Billing"
```

- The **number** only sets the order in the sidebar. It never appears in the URL or the label.
- The **name** becomes the URL and the label (`4-team-settings` → "Team settings").
- A folder only shows up once it contains a `+page.svelte`. Sub-folders become indented sub-items.

### Icons

Add `static/dashboard-icons/<name>.svg` (or `.png`), using the folder name without its number:

| Page folder | Icon file |
|---|---|
| `2-account/` | `account.svg` |
| `4-projects/2-archive/` | `projects.archive.svg` |

All plans share the same icons. Restart `npm run dev` if a new icon doesn't appear.

---

## 4. Anatomy of a page (keep every page independent)

Each page folder contains **everything that page needs**, and nothing else uses it:

| File | What goes in it |
|---|---|
| `+page.svelte` | the page (HTML, Svelte) |
| `+page.server.js` | server code for this page: `load` (read data) and `actions` (handle forms) |
| `+server.js` | a JSON API, only if this page's own JavaScript needs one |
| `Something.svelte` / `something.js` | small pieces used **only** by this page |

**Independence rules:**
1. **Never import from another page's folder**: not a neighbour, not a parent, not another plan's copy.
2. **No shared helper files.** No `utils.js`, no `components/` folder, nothing new in `src/lib/`. If two pages need the same code, **copy it**.
3. Small helper functions *inside* a page's own file are fine.

**The only imports allowed from outside your page folder:**

| Import | Use it for |
|---|---|
| `@sveltejs/kit` → `fail`, `redirect`, `error`, `json` | responses |
| `$app/forms`, `$app/state`, `$app/navigation` | forms, current page info, navigation |
| `$env/dynamic/private` | reading existing settings from `.env` |
| `import { db } from '$lib/server/db.js'` | database queries |
| `import { auth } from '$lib/server/auth.js'` | account features (password, email, sessions…) |
| `import { polar } from '$lib/server/polar.js'` | billing features |
| `import { plans } from '../../../(auth)/checkout/polar.js'` | the list of plans (read only) |
| packages already in `package.json` | anything else |

### What every dashboard page gets for free

- **In server code** (`+page.server.js`, `+server.js`):
  - `locals.user`, the logged-in user (`id`, `name`, `email`). It's always set here.
  - `locals.plan`: `'free'`, `'basic'`, `'monthly'`…
- **In the page** (`+page.svelte`):
  - `data.user`
  - `data.base`: the plan's dashboard URL, e.g. `/dashboard/basic`
  - plus whatever your `load` returns

**Never hard-code `/dashboard/basic/...`** in a page, because the same page also lives under other plans. Write `href="{data.base}/projects"` instead.

---

## 5. Walkthrough: add a "Projects" page

Say Basic and Monthly users should both get a Projects page. (This example assumes your lead has already created a `project` table with `id`, `user_id`, `name`.)

**Step 1: create the folder in each plan**

```
src/routes/dashboard/basic/4-projects/
src/routes/dashboard/monthly/4-projects/
```

**Step 2: server code**, `4-projects/+page.server.js`:

```js
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';

// Read: only this user's projects
export async function load({ locals }) {
	const [projects] = await db.execute('SELECT id, name FROM project WHERE user_id = ? ORDER BY id DESC', [locals.user.id]);
	return { projects };
}

export const actions = {
	// Create: <form action="?/create">
	create: async ({ request, locals }) => {
		const name = (await request.formData()).get('name')?.toString().trim();
		if (!name) return fail(400, { error: 'Name is required.' });

		await db.execute('INSERT INTO project (user_id, name) VALUES (?, ?)', [locals.user.id, name]);
		return { success: 'Project created.' };
	},

	// Delete: the "AND user_id = ?" stops users deleting other people's projects
	delete: async ({ request, locals }) => {
		const id = (await request.formData()).get('id');
		const [result] = await db.execute('DELETE FROM project WHERE id = ? AND user_id = ?', [id, locals.user.id]);
		if (result.affectedRows === 0) return fail(404, { error: 'Project not found.' });
		return { success: 'Project deleted.' };
	}
};
```

**Step 3: the page**, `4-projects/+page.svelte`:

```svelte
<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head><title>Projects</title></svelte:head>

<div class="max-w-3xl space-y-6">
	<h1 class="text-2xl font-semibold">Projects</h1>

	<form method="POST" action="?/create" use:enhance class="card flex gap-2">
		<input name="name" required placeholder="Project name" class="input" />
		<button class="btn-primary">Add</button>
	</form>

	{#if form?.error}<p class="text-sm text-red-600">{form.error}</p>{/if}
	{#if form?.success}<p class="text-sm text-secondary">{form.success}</p>{/if}

	<ul class="card divide-y divide-gray-100">
		{#each data.projects as project (project.id)}
			<li class="flex items-center justify-between py-2">
				{project.name}
				<form method="POST" action="?/delete" use:enhance>
					<input type="hidden" name="id" value={project.id} />
					<button class="btn">Delete</button>
				</form>
			</li>
		{:else}
			<li class="py-2 text-gray-500">No projects yet.</li>
		{/each}
	</ul>
</div>
```

**Step 4: copy** both files into `monthly/4-projects/`. Then add `static/dashboard-icons/projects.svg` for the sidebar icon.

That's it. "Projects" now appears in the Basic and Monthly sidebars, and Free users can't open it.

### Need a JSON API for the page's JavaScript?

Put a `+server.js` in the **same folder**:

```js
// src/routes/dashboard/basic/4-projects/+server.js
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';

export async function GET({ locals }) {
	const [rows] = await db.execute('SELECT COUNT(*) AS count FROM project WHERE user_id = ?', [locals.user.id]);
	return json({ count: rows[0].count });
}
```

Call it from the page with a JSON `accept` header. The same URL serves the page to browsers and the JSON to `fetch`:

```js
import { page } from '$app/state';
const res = await fetch(page.url.pathname, { headers: { accept: 'application/json' } });
```

Prefer `load` and form actions. Only add `+server.js` when you really need data from JavaScript.

---

## 6. Security checklist (read before every pull request)

- [ ] Every query filters by the logged-in user: `WHERE user_id = ?` with `locals.user.id`.
- [ ] IDs coming from forms or URLs are checked against the user (`WHERE id = ? AND user_id = ?`).
- [ ] SQL uses `?` placeholders, **never** string concatenation like `'... WHERE id = ' + id`.
- [ ] You only return the fields the page needs, never passwords, tokens or whole rows with private data.
- [ ] You don't redirect to a URL that came from user input.

---

## 7. Styling

Use Tailwind classes plus these ready-made ones:

| Class | Use for |
|---|---|
| `card` | white box with border |
| `input` | text inputs, selects, textareas |
| `btn-primary` | main button (brand color) |
| `btn` | secondary button |
| `btn-danger` | destructive button (delete) |
| `link` | text links |

Brand colors: `bg-primary`, `text-primary`, `bg-primary-soft`, `text-primary-fg`, and the same with `secondary`. Don't hard-code brand colors like `bg-indigo-600`; the lead changes them in one place for each product.

---

## 8. Testing your page

1. **Build check:**
   ```bash
   npx vite build
   ```
   It must finish without errors.
2. **Try it as each plan that has the page, and as a user who shouldn't have it.** Change your own test user's plan in your **local** database:
   ```sql
   -- Put yourself on Basic (the plan name = the folder name)
   DELETE FROM subscription WHERE user_id = (SELECT id FROM `user` WHERE email = 'you@example.com');
   INSERT INTO subscription (user_id, plan, status, external_id)
     SELECT id, 'basic', 'active', 'dev-fake-id' FROM `user` WHERE email = 'you@example.com';

   -- Back to free
   DELETE FROM subscription WHERE user_id = (SELECT id FROM `user` WHERE email = 'you@example.com');
   ```
   Then reload http://localhost:5173/dashboard.

   The Billing page talks to Polar and won't work with this fake plan. To test billing, subscribe through the real checkout in the Polar **sandbox**, using Polar's test card numbers.
3. **Check the sidebar:** your page appears in the right place, with its icon.
4. **Check the pull request:** it only changes files inside `src/routes/dashboard/<plan>/` and `static/dashboard-icons/`.

---

## 9. Troubleshooting

| Problem | Likely cause |
|---|---|
| "Invalid origin" (403) when logging in | You opened the app on a different address than `BETTER_AUTH_URL` in `.env`. Use exactly that address. |
| You're always sent to `/dashboard/free` | Your user has no active subscription row. See the SQL in section 8. |
| New page missing from the sidebar | The folder has no `+page.svelte`, or it's in the wrong plan folder. |
| New icon doesn't show | File name doesn't match the folder name (without the number), or restart `npm run dev`. |
| "Cannot find module" for an import | Imports from outside your page need one more `../` per folder level. Better: only use the allowed imports in section 4. |
| Billing page shows an error | A product ID in the plan list doesn't exist in the Polar environment you're using (sandbox vs production). Tell your lead. |
| No login code email arrives | SMTP settings in `.env` are wrong or empty. Check the terminal running `npm run dev` for errors. |
