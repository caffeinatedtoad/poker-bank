# Learning notes: SvelteKit for a Go developer

This file grows with each build step. Start with the concept map, then the tour of files.

## Concept map

| SvelteKit / frontend                           | Go equivalent                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/hooks.server.ts` `handle()`               | HTTP middleware (`func(next http.Handler) http.Handler`)                      |
| `event.locals.user`                            | a value in `context.Context` set by middleware                                |
| `+page.server.ts` `load()`                     | GET handler that returns data instead of writing HTML                         |
| `+page.server.ts` `actions`                    | POST handlers for `<form>` submits (`?/buyin` → the `buyin` action)           |
| `+page.svelte`                                 | `html/template`, but reactive and run on both server and browser              |
| `src/lib/server/*`                             | `internal/` packages; SvelteKit **refuses** to bundle these into browser code |
| `src/routes/g/[id]/` folder                    | router pattern `/g/{id}`; `params.id` = `r.PathValue("id")`                   |
| `fail(400, {...})` / `error(403)`              | `http.Error` with a status code                                               |
| `src/env.ts` + `$app/env/private`              | an `envconfig` struct, validated at startup                                   |
| Drizzle schema + migrations                    | `sqlc`/`goose`: typed schema + SQL migration files                            |
| Vitest (`*.test.ts` next to the code)          | `go test` (`*_test.go` next to the code)                                      |
| `package.json` + `package-lock.json`           | `go.mod` + `go.sum`                                                           |
| `.nvmrc`                                       | the `go` / `toolchain` line in `go.mod`                                       |
| `npm run dev` / `npm run build` → `node build` | `go run .` / `go build` → run the binary                                      |

Rule of thumb: **all logic lives in `src/lib/server` as plain functions** that take arguments and return
values. Routes are thin handlers that call them, and pages only display data and post forms.

## Follow one request: the bank taps a chip

1. **Browser:** the chip is a `<button>` inside `<form method="POST" action="?/buyin">` in
   `src/routes/g/[id]/+page.svelte`, with hidden inputs `playerId` and `amount`. `use:enhance` sends it with `fetch`.
2. **Middleware:** `src/hooks.server.ts` reads the `remote-email` header into `locals.user` (or returns 401).
3. **CSRF (production only):** SvelteKit checks the `Origin` header matches the site, or returns 403.
4. **Handler:** `actions.buyin` in `src/routes/g/[id]/+page.server.ts` calls `bankGroup()` (404 or 403),
   then reads `playerId` and `amount` with `#lib/server/forms.ts` (400 if invalid).
5. **Service:** `buyIn()` in `src/lib/server/ledger.ts` checks the player belongs to this group, then
   inserts one `entries` row with `delta_cents = 2000, kind = 'buyin'`.
6. **Response:** the action returns nothing (success). `use:enhance` then re-runs `load()`, which calls
   `listPlayers()` (`SUM(delta_cents)` per player) and sends the new `data` as JSON.
7. **Re-render:** Svelte updates the balance and total in place. Within 5 seconds every other viewer's
   poll (`refreshAll()`) picks up the same change.

## Tour of the files (step 1: scaffold)

- `package.json`: dependencies and the `scripts` you run with `npm run <name>`, like a Makefile.
- `vite.config.ts`: the build tool config. Vite compiles TypeScript and Svelte, and also runs the tests.
- `src/app.html`: the one HTML shell. SvelteKit injects each page into `%sveltekit.body%`.
- `src/routes/`: **the folder structure is the router.** `src/routes/+page.svelte` is `/`.
  - `+layout.svelte` wraps every page (shared `<head>`, global CSS). `{@render children()}` is where the page goes.
  - `layout.css` loads Tailwind (utility classes like `p-4`, `text-2xl`) and DaisyUI (component classes like `btn`).
- `src/env.ts`: declares every env var the app reads. They're validated at startup; read them via `$app/env/private`.
- `src/lib/`: shared code. Import it as `#lib/...`. Anything under `src/lib/server/` is server-only.
- `drizzle.config.ts`: config for `drizzle-kit`, the migration CLI (`npm run db:generate`, `db:migrate`).
- `.env`: local env values (git-ignored). `.env.example` is the committed template.

### Try it

`npm run dev`, open http://localhost:5173, then edit the text in `src/routes/+page.svelte` and save.
The browser updates without a reload. That's Vite's hot module replacement.

## Step 2: money helpers and tests

- `src/lib/money.ts` is plain TypeScript with no framework code. It lives in `src/lib` (not `lib/server`)
  because both the server and the browser format money.
- TypeScript in Go terms: `number | null` is like returning `(int, bool)`. The caller must handle `null`
  before using the value, and the compiler enforces that.
- `export` = capitalized identifier in Go. Anything not exported is package-private.
- `src/lib/money.test.ts` sits next to the code like `money_test.go`. `it.each([...])` is a table-driven test.
  Run `npm run test:unit` for watch mode, which re-runs tests on save.

## Step 3: database and ledger

- `src/lib/server/db/schema.ts` defines the tables in TypeScript. `npm run db:generate` diffs it against
  `drizzle/` and writes a new numbered `.sql` migration (like `goose create`). Commit those files.
  Read `drizzle/0000_init.sql` to see exactly what SQL Drizzle generated.
- The app runs pending migrations itself on startup (`openDb` in `db/open.ts`). There's no separate migrate step.
- Drizzle is a typed query builder, closer to `squirrel`/`sqlc` than to an ORM like GORM:
  `db.select().from(players).where(eq(players.groupId, id)).all()` maps straight to the SQL you'd write.
  `.all()` returns rows, `.get()` one row or `undefined`, `.run()` executes.
- better-sqlite3 is **synchronous**, so there's no `await` anywhere in the data layer. In-process SQLite
  calls take microseconds, so blocking is fine, and the code reads like Go.
- Service functions take `db: DB` as the first argument (dependency injection, as in Go).
  The app passes the shared handle from `db/index.ts`, and tests pass `openDb(':memory:')`.
  `DB` also matches a transaction (`tx`), so the same helper works inside or outside one.
- `error(404, '...')` from `@sveltejs/kit` **throws**, which aborts the request with that status.
  Think of it as `panic` that SvelteKit recovers into an HTTP response, with no `if err != nil` chain.
- Balances are never stored. They're `SUM(delta_cents)` over an append-only `entries` table, so "clear" and
  "set" append a correcting entry and the full history survives mistakes.

## Step 4: read-only pages

- A route is a folder with up to two files: `+page.server.ts` (server only: `load()` and later `actions`)
  and `+page.svelte` (the template). `src/routes/g/[id]/` is the pattern `/g/{id}`.
- `load()` returns a plain object, and SvelteKit hands it to the page as `data`. The `./$types` import is
  **generated** from your `load()` return type, so `data.players[0].balanceCents` is type-checked end to end.
  Think of it as an API contract that writes itself.
- On the first visit the page is rendered to HTML on the server (curl shows real content). After that,
  navigating between pages fetches only the `load()` data as JSON and re-renders in the browser.
- Svelte template syntax: `{#each list as item (item.id)}` is `range` (the `(item.id)` is a key, like a map key,
  so rows keep their identity when the list changes); `{#if}`/`{:else}`; `{expr}` prints escaped text;
  `class:text-primary={cond}` toggles a class.
- Runes, Svelte's reactivity markers: `$props()` receives inputs and `$derived(expr)` recomputes when its
  inputs change. No manual cache invalidation.
- `#lib` imports need the real file extension (`#lib/money.ts`). It's a literal path alias, not magic resolution.
- Styling: Tailwind utility classes in the markup (`flex`, `gap-4`, `text-3xl`) instead of a separate CSS file.
  The theme colors (`text-primary`, `bg-base-200`) come from the DaisyUI themes in `layout.css`, which switch
  between light (`cardroom`) and dark (`felt`) automatically.

## Step 5: auth middleware

- `src/hooks.server.ts` `handle()` runs before every request, like wrapping your mux in middleware.
  Returning a `Response` early is `http.Error(w, ...); return`, and `resolve(event)` is `next.ServeHTTP(w, r)`.
- `event.locals` is per-request storage, like `context.WithValue`. Its shape is declared once in
  `src/app.d.ts` (`App.Locals`), so `locals.user` is typed everywhere without casts.
- `+layout.server.ts` loads data for **every** page under it. That's how the header shows the user.
- There's no login code: Pangolin does SSO and forwards the email header. That makes the header a security
  boundary. Anyone who can reach the pod directly could forge it, so the Service must stay internal.
- `DEV_USER` only works under `npm run dev` (`dev` from `$app/env`). Try it as someone else:
  `curl -H 'remote-email: sam@example.com' localhost:5173`.

## Steps 6 and 7: forms, actions and confirmations

- **Actions are POST handlers.** `<form method="POST" action="?/buyin">` posts to the current URL and runs
  `actions.buyin` in `+page.server.ts`. Each action is the same shape as a Go handler:
  1. `bankGroup()` loads the group and throws 403 unless you're its bank (authorization first, always),
  2. read and validate fields with `#lib/server/forms.ts` (`r.FormValue` plus parsing),
  3. on bad input `return fail(400, { error })`, which shows up as `form.error` on the page,
  4. call one service function. On success, SvelteKit re-runs `load()` so the page shows fresh data.
- **Hiding buttons is not security.** Non-banks never see the chip, but the 403 in every action is what stops
  a hand-crafted POST. One check is easy to miss: `requirePlayer` in `ledger.ts` rejects a player id from
  another group, so sam (bank of group 2) can't post `playerId=1` to `/g/2?/buyin` and touch group 1.
- **Progressive enhancement:** forms are plain HTML and work with JavaScript off (full page reload).
  `use:enhance` upgrades them to `fetch` with no reload. Same server code either way.
- **CSRF:** in production SvelteKit rejects form posts whose `Origin` doesn't match the site (403).
  The dev server skips this check, so test it with `npm run build && npm start`. adapter-node assumes
  `https` (true behind Pangolin), so `npm start` over plain `http://localhost` rejects forms. Use `npm run dev` locally.
- **Components:** `ConfirmDialog.svelte` is a reusable piece of UI with typed `Props` (its parameters).
  `children: Snippet` is the slot for whatever the caller puts between the tags, rendered with `{@render children()}`.
  `bind:this={dialog}` gives you the real DOM element, like holding a pointer.
- **`$state` vs `$derived`:** `amount` is `$state` because the bank edits it. `amountCents` is `$derived`
  from it, so the chip label, the hidden input and the "make default" button all update as you type.
- **Native `<dialog>`:** `showModal()` gives focus trapping, Esc-to-close and a backdrop for free. The page mounts
  the dialog only while a confirmation is pending (`{#if pending}`) and clears `pending` in `onclose`.

## Step 8: live updates by polling

- The group page calls `refreshAll()` from `$app/navigation` every 5 seconds. That re-runs `load()` on the server
  and swaps in the new `data`, and Svelte re-renders only what changed. It's a GET on a ticker, the simplest
  "live" that works. There's no websocket server to run on the Pi.
- `$effect(() => { ...; return cleanup })` runs in the browser after the page mounts. The returned function runs
  when the page goes away, like `defer ticker.Stop()`. Effects never run during server rendering.
- Polling skips hidden tabs (`document.hidden`), so phones in pockets don't keep hitting the server.
- Local `$state` (the typed buy-in amount) survives refreshes, because only `data` is replaced.

## Step 9: container and Kubernetes

- `Dockerfile` is a two-stage build, as you'd do for Go: stage one has npm and all devDependencies and runs
  `vite build`. Stage two copies only `build/` (the bundled server), the SQL migrations, and `node_modules`
  pruned down to better-sqlite3. adapter-node bundles every devDependency into `build/`, so only packages
  in `dependencies` (native code that can't be bundled) are needed at runtime.
- `node build` is the production entrypoint: a plain Node HTTP server, like running your compiled binary.
- better-sqlite3 v13 ships prebuilt native binaries (`prebuilds/linux-arm64.node`), so the arm64 image builds
  under emulation without a C++ toolchain. `npm ci --ignore-scripts` stops npm trying to compile it anyway.
- Kubernetes: `replicas: 1` plus `strategy: Recreate`, because SQLite is a file on a single-node volume.
  Two pods writing it would be like two processes sharing a BoltDB file. Probes use TCP because every HTTP
  request without Pangolin's header is a 401.

## Feature: cash out

A good example of a change that cuts through every layer:

- **Schema:** added `'cashout'` to the `kind` enum in `schema.ts`. `npm run db:generate` reported
  "No schema changes". A Drizzle `enum` on a `text` column is a TypeScript-only constraint, so SQLite never sees it.
- **Service:** `cashOut()` in `ledger.ts` appends `-amount`. Buy in $5 + $5, cash out $15: 500 + 500 − 1500 = −500.
  A negative balance means the player is in the green. The first test in `ledger.test.ts` is exactly that scenario.
- **Handler:** the `cashout` action in `g/[id]/+page.server.ts` follows the same four steps as every other action.
- **UI:** a "Cash out" button opens `ConfirmDialog` with a Now / After preview built from `describeBalance()`
  in `money.ts`, which is shared so every screen words balances the same way.

## Mobile-first pass

Phone browsers have quirks that desktop testing never shows. The ones this app handles, and where:

- **iOS zooms into any input under 16px** when it's focused. Small inputs use `text-base` (16px).
- **Tap targets are at least 44–48px** (Apple's HIG says 44pt, Material says 48dp). DaisyUI's `--size-field: 0.3rem`
  in `layout.css` makes every `btn` and `input` 48px tall.
- **Double-tap zoom** would turn two quick chip taps into a zoom. `touch-action: manipulation` on `html` disables it
  but keeps pinch zoom.
- **The iOS keyboard doesn't resize the page**, so anything pinned to the bottom can hide behind it. Dialogs with a
  text field use `position="top"` (`ConfirmDialog.svelte`). Bottom sheets only hold buttons.
- **iOS's `decimal` keypad has no minus key.** The Set dialog uses the full keyboard so negative amounts work.
- **Notch and home indicator:** `viewport-fit=cover` in `app.html` plus the `safe-x`, `safe-top` and
  `safe-bottom` classes, which pad with `env(safe-area-inset-*)`.
- **Thumb zone:** the bottom third of the screen is easiest to reach. The buy-in bar and action sheets live there.
- **Undo instead of confirm** for the frequent, reversible action (a chip tap). Confirmation dialogs are kept for
  rare or destructive actions. That follows Baymard's research on accidental taps.
- **Add to Home Screen:** `static/manifest.webmanifest` plus `apple-touch-icon.png` make it open full screen
  with the chip icon. iOS 26 colours its toolbars from the `body` background, so `app.html` sets one explicitly.

Svelte features introduced here: `{#snippet}` / `{@render}` (a reusable template block, like `{{define}}`/`{{template}}`
in Go) and `requestSubmit()`, which submits a form from code while keeping `use:enhance`.
