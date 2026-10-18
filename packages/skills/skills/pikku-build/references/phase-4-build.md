# Phase 4 — Build (§6, §6a, §6b)

Part of the app workflow (`app.md` is the index and the rules that hold throughout). Read this for each changeset. Proving and shipping it are §7-§9, in `phase-5-prove-and-ship.md`.

## 6. Build each changeset

**Per changeset** — claim it, plan it if the claim says so (§5a), do the six
steps one commit per change, close it out (§6a), mark its changes done. Do not
mark the last one done until §6a passes, §7 is green for it _and §7a shows its
functions covered_; `changes done` refuses a planned changeset's last change
while the plan is short.

1. **Migration.** SQL in `db/sqlite/` at the project root (`db/postgres/` or
   `db/mysql/` when `createConfig` sets `postgresUrl` or `mysqlUrl`), numbered on from the
   ones already there. Apply with `bunx --bun pikku db migrate`, which also
   regenerates the Kysely types your functions import. **Neither `pikku all` nor
   restarting `pikku dev` applies a migration** — so a new column reads as
   `TS2353 … does not exist in type 'InsertExpression<DB, "…">'` on the function
   that writes it. An unapplied migration is the usual cause and the cheapest to
   rule out, so run `db migrate` first — but the same error is what a misspelt
   column or a stale generated type looks like, so if it survives the migration,
   go and read the SQL.
2. **Seed.** Demo rows in `db/sqlite-dev-seed.sql`. **There is no seed command** —
   `bunx --bun pikku db reset` is the only thing that applies the file, and it
   wipes, migrates and seeds in one go (`--no-seed` stops after the migration,
   for working on an empty state the test data would hide). Because reset always
   arrives at a database it just wiped, **the seed file is plain `INSERT`s** — no
   `ON CONFLICT DO NOTHING`, no `INSERT OR IGNORE`. Nothing ever applies it
   twice, so it never has to defend itself. It is also **local only** — no deploy
   applies it, so anything the app would be broken without in production is
   configuration and belongs in a migration, not here.
   Do this generously and do it now: an empty app demos badly and critiques
   badly, and you cannot judge a screen's hierarchy, overflow, or truncation
   against zero rows. Seed rows each virtual user sees differently — with an ownership
   rule that means seeding rows for the _second_ owner too.
3. **Functions.** One `pikkuFunc` per `*.function.ts`. Mark it `expose: true` and
   Pikku generates the typed RPC client and the React Query hooks the UI calls;
   you do NOT write an HTTP route for it. Add `wireHTTP` only for a real REST
   shape (a third-party webhook).
4. **Regenerate:** `bunx --bun pikku all`
5. **UI.** Pages in `<app>/src/pages/`, one route file each in `<app>/src/routes/`,
   calling functions through the generated `usePikkuQuery` / `usePikkuMutation`
   hooks from `@project/functions-sdk/pikku/api.gen`. One component per `.tsx`
   file. Compose the kit from `@/components/<Name>` rather than hand-rolling
   controls, and add to it where the design reference (see SKILL.md), "The kit is a floor", says to.
   Register the screen in `useNavItems()` — that one file feeds both the
   desktop sidebar and the phone navigation.
   **Read the design reference (see SKILL.md) before you write the first screen.** You commit
   to a design direction there and are then accountable to it — it hands you no
   layouts, because the design is yours to make. What you build here is then
   judged at step 7, at the end of this changeset rather than once at §8, where
   the only affordable fix is a repaint of eight screens.
6. **Scenario** (§7).
7. **Look at it.** Screenshot every screen this changeset touched, at both
   widths, with the seed in place, and look at the images. This is a gate, the
   same as the scenario: a changeset whose screens nobody has seen is not built,
   it is unproven at the one layer scenarios cannot reach. the design reference
   carries how to take the shot when no browser tool is wired up, and what to
   look for. Then close it against its plan (§6a) — `pikku knowledge plan
progress` has to exit zero before the last change is done — and only then
   mark it done, saying in the `--note` what you looked at and what it made you
   change.

Rules that are not optional:

- A function's input and output types come from its `input:`/`output:` zod
  schemas. Never pass generic type params, never annotate the return type inline.
  The schema is the type. (Generics XOR schemas — never both.)
- Auth and permission checks go in the `permissions` field, never in the function
  body. This is what makes §4's app split safe.
- No `process.env` inside a function. Read config through the injected
  `variables` / `secrets` services; `process.env` belongs only in bootstrap. Every
  secret a function reads needs a matching `defineSecret`, or `pikku all` reports
  PKU951 and nobody knows what to provision at deploy.
- Let the database type your values, via `db/annotations.ts`. A `BOOLEAN` column
  is derived for you. On SQLite the other two are **not** — add them by hand,
  once, and they are typed AND coerced end-to-end:

  ```typescript
  export const classifications = {
    payment: {
      paid_at: { kind: 'date' }, // -> Date, not an ISO string
      metadata: { kind: 'json', tsType: 'PaymentMeta' }, // -> parsed object, not unknown
    },
  }
  ```

  A `TIMESTAMP`/`DATETIME`/`DATE` column with no entry types as `string`, and a
  `JSON` column with no entry types as `unknown` (the CLI warns PKU481). Add the
  annotation rather than casting around the generated type. Once the file carries
  manual fields, `db migrate` stops overwriting it.

- A `z.date()` on a function's **input** arrives over RPC as an ISO string, not a
  `Date`. Normalise before calling date methods on it (`new Date(value)`), or it
  throws `.getTime is not a function` at runtime — schema validation accepts the
  string without converting it.
- Every user-facing string is a translation key. Never a hardcoded literal. With
  two apps that means two `messages/` directories; a string used by both belongs
  to whichever app renders it, and duplication beats a shared bundle that couples
  the apps together.
- Surface errors. No empty catch, no swallowed promise. If a mutation can fail,
  render the failure inline next to the control that triggered it — not a toast.
- An exposed function with no session and no permission is reachable by anyone
  over `POST /rpc/:rpcName` (PKU574). Either gate it, drop `expose: true`, or —
  when public is the point — write `auth: false` on it to say so.
- A public, signed-out read (a homepage's programme, a price list) is a
  `pikkuSessionlessFunc` with `auth: false` written out, which is what keeps
  PKU574 quiet for it. `pikkuFunc` with `auth: false` still answers
  `MissingSessionError` over `/rpc` to a caller with no session.
- Better Auth already owns the `user`, `session`, `account` and `verification`
  tables. A domain table with one of those names — a class _session_, a drop-in
  _session_ — collides in the migration. Name it for the domain instead
  (`evening`, `class_meeting`) and keep the word in the UI copy.
- The template's `/` redirects to `/app`, so the login screen is what a
  signed-out visitor sees first. Replace `/` with a public homepage and a
  reviewer lands on a site with no way in: link it to the login screen.

Before the first run, make sure `.env` at the project root holds the secret
the local stack needs. `bun run dev` appends it if missing, but check anyway —
a project scaffolded from an older template, or a `.env` copied in from
elsewhere, can lack it, and the failure does not name the variable:

- `BETTER_AUTH_SECRET` — without it the first sign-up is a 500.

Virtual user sign-in needs nothing in `.env`: `pikku dev` creates its own key
pair and hands the app the public half.

```sh
grep -q '^BETTER_AUTH_SECRET=' .env 2>/dev/null || echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env
```

`.env` is gitignored and local only — never commit it. A deployed stage gets its
secrets from the hosting platform, not from this file.

Then run it:

```sh
bun run prebuild && bun run dev
```

That starts the API on :3000 and every frontend in `frontends`. A
frontend running against a dead API looks exactly like an app bug, so if every
request fails, check that both halves came up.

**Start the stack through `bun run dev`, not by launching `vite` or `pikku dev`
yourself.** The frontend needs to reach _your_ API. If you start the
frontend on its own (say :3000 is taken by another project), point
`VITE_API_PROXY` at your API: the dev proxy defaults to `http://localhost:3000`,
so beside another project's server every request goes to the wrong API.

The `--bun` in `bunx --bun pikku …` is load-bearing — keep it. Without it the
CLI's `#!/usr/bin/env node` shebang hands the process to whatever Node is on
PATH, which fails below Node 24 with `ERR_UNKNOWN_BUILTIN_MODULE: No such
built-in module: node:sqlite`.

Open it, sign up, and click through what you built. **HTTP 200 is not evidence.**
The pages are client-rendered: the server returns 200 with an empty shell, so a
page whose component throws still looks fine to `curl`.

That click-through is a smoke check, and it is the only thing it is. **Do not
hand-drive a browser tool in place of a test.** Steering Playwright yourself
proves a page rendered once, on your machine, in an order only you remember —
nothing about it re-runs, so the next agent inherits a claim rather than a test,
and a regression lands silently. When a journey is worth driving through the UI,
it is worth writing as a browser step on §7's scenario and running
`pikku scenario run local --spawn --run browser`: same clicks, same assertions,
in the repo, green or red on every future run.

**A host can inject platform services into `pikku dev`** the way a deploy does, with
`dev.contributors` in `pikku.config.json`:

```json
{
  "dev": {
    "contributors": [
      { "module": "./dev/email-contributor.ts", "export": "email" }
    ]
  }
}
```

The module exports a `PlatformServiceContributor` (`{ name, imports?, emit }`, the
type `@pikku/deploy` takes). `pikku all` writes `.pikku/pikku-dev-platform-services.gen.ts`
from them, and `pikku dev` merges what it returns over the local services before
`createSingletonServices` runs, so a contributed `emailService` beats
`LocalEmailService` (and the test-mode spy). Nothing is written without
contributors, `pikku serve` never loads it, and `NODE_ENV=production` ignores it. An import a contributor names by `file://` URL or absolute path is written as the package export that points at it, or as a path relative to `.pikku/`, so the file typechecks under the project's tsconfig as long as the lines a contributor emits are typed.

## 6a. Close the changeset against its plan, not against your memory

```sh
pikku knowledge plan progress <changeset>
```

It reads §5a's plan and reconciles it against the generated meta under
`.pikku/` — the function exists or it does not, the route is wired or it is not,
the `pikkuScenario` export is there or it is not. Nothing it reports comes from
what anyone claimed. It exits non-zero while anything in the first pass is
missing, and `changes done` runs the same check on the last change.

Three things it says, and what each one asks of you:

- **MISSING** — the first pass owes it and the meta cannot see it. Either build
  it, or, if it genuinely belongs to later work, move it out with a reason on
  the record:

  ```sh
  pikku knowledge plan defer <changeset> function:sendReminder \
    -r "The email service it needs is the next changeset."
  ```

  **A deferral is capped at two per plan.** Past that, the plan was wrong and the
  changeset is two changesets — say so rather than deferring again. What you may
  never do is drop the item silently. A merged changeset with deferrals leaves its
  notes `partial`, and `pikku knowledge gaps` files what it left behind.

- **PROBLEMS** — something exists but does not do what was planned. A function
  planned as restricted whose meta says `auth: false`; a `cascade` no migration
  declares; a browser scenario that opens a page and asserts it is still on it.
  These are never deferred. Fix the app.
- **DEFERRED to a later pass** — already accounted for. Reported so it is
  visible, never blocking.

Do not edit the plan to match what you built — the plan was written before the
code on purpose, and rewriting your own denominator afterwards is exactly what
that order exists to stop.

### 6b. Feed the changeset back into the seats

Before starting the next changeset, answer two questions out loud:

- **What did the plan fail to say?** A field nothing wrote, a promise no function
  could keep, a pass 1 that turned out to be two. That is a `pikku-architect`
  lesson.
- **What did the build learn the hard way?** Anything that cost a wasted run —
  a stale process, a scenario that only passes once, a diagnostic that turned
  out to be an echo of an earlier one. That is a `pikku-build` lesson.

Then edit the skill — **at most one change to each per changeset**, and only for
something that actually went wrong here. A rule with no incident behind it is a
guess, and these files are read in full every time: they earn their length by
naming failures a reader would otherwise repeat. Prefer sharpening an existing
line to appending a new one, and delete a rule the last few changesets have
shown to be noise.

The gates are the compounding part. A lesson written into a scenario the suite
runs, or into a check `plan progress` can see, is enforced; the same lesson
written as prose is a thing the next reader has to remember. Reach for prose
only when there is nothing to hang a check on.
