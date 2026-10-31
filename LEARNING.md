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
