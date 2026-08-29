---
name: pikku-feature
description: 'Drive create-a-feature work inside a Pikku project that already exists: discover project context, work on a feature branch, implement + verify + commit, and ask the user to review via the diff. TRIGGER when: the user asks to "create a feature", "add X to my Pikku project", "wire up a new endpoint", or anything that implies turning a natural-language request into Pikku functions/wirings/migrations within a working app. DO NOT TRIGGER when: the user asks for a one-off code edit in an existing function, asks about Pikku concepts (use pikku-concepts), or is building a whole app from a fresh scaffold rather than extending one (use pikku-build-app, or pikku-build-quick / pikku-build-platform).'
allowed-tools: Bash(yarn pikku meta *), Bash(yarn pikku all *), Bash(yarn tsc), Bash(git status *), Bash(git diff *), Bash(git switch *), Bash(git checkout *), Bash(git checkout -b *), Bash(git add *), Bash(git commit *), Bash(git log *), Bash(git branch *), Bash(yarn pikku fabric report *), Bash(npx pikku fabric report *)
argument-hint: '<feature description>'
---

# Pikku Create-a-Feature

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.
6. Report anything about pikku itself that cost you time, the moment it happens — see **Report what fought you**.

End-to-end flow: **discover → state intent → branch → implement → verify → commit → hand to reviewer**.

There is **no plan JSON**. The branch + diff IS the contract. The reviewer
sees real, compiled, working code. Apply = merge. Reject = `git branch -D`.

## Stage 1 — Discover

Run **once** at the start of every feature request:

```bash
yarn pikku meta context --json
```

This single call returns functions, wires, middleware, permissions, workflows,
`capabilities` (which wire types are in use), and `layout` (where new files
should land).

Only fall back to targeted commands when you need full input/output JSON
schemas (`yarn pikku meta functions get <id>`) or workflow steps
(`yarn pikku meta workflows get <id>`).

**Capability rule:** do not introduce new wires of a type whose
`capabilities.<type>` is `false` unless the user explicitly asked for it.

**Language rule:** read `locale` in `pikku.config.json` (default `en`). It is
the language of every `description`, `title` and step `template` you author —
the meta the Pikku Console renders back to the team. It renames nothing:
functions, components, types, files, tables and columns are English in every
project, and what the app says to its users is the message catalogue. See
`pikku-concepts` → _What Language You Write In_.

## Stage 2 — State intent in plain English (BEFORE writing code)

Before touching any files, give the user one paragraph stating exactly what
you'll do. This is the lightweight "plan" — it is chat, not JSON.

> I'll add a `todos` table via a new migration in `sql/`, and two
> `pikkuSessionlessFunc`s (`createTodo`, `listTodos` with
> `readonly: true`) in `packages/functions/src/functions/`. Both
> `expose: true`, so they'll be reachable via the auto-generated RPC
> client and React Query hooks — no HTTP wiring needed. No new
> dependencies. OK to proceed?

Wait for the user to confirm or redirect. They can ask for changes ("use the
existing tasks table" / "make it a queue not http") in normal chat — no
schema, no JSON, no ceremony.

**Non-interactive runs (auto mode, CI, batch jobs):** state intent in one
paragraph and proceed without waiting. Surface course corrections promptly
in the post-implementation report.

## Stage 3 — Branch off

After confirmation, ensure the working tree is clean and create a feature
branch off the current default branch (whatever `git branch --show-current`
returns at the start — `main`, `master`, `develop`, all fine):

```bash
git status
git switch -c feature/<short-slug>
```

If the working tree is dirty, **stop and ask** — never stash silently or
overwrite uncommitted work.

## Stage 4 — Implement

Write the code as a normal human contributor would. Use the project's
existing conventions (look at neighbour files in `srcDirectories[0]/functions/`
and `.../wirings/` for style).

### RPC is the default transport

**Just write the function with `expose: true`** — that's enough to make it
callable. Pikku auto-generates an RPC client (and React Query hooks if the
project's `clientFiles.reactQueryFile` is set) from every exposed function.
You do **not** need an HTTP wiring for callers to reach the function.

Default flow for a feature:

1. Write the function file with `expose: true` (and `readonly: true` for
   reads).
2. Run `pikku all` — RPC map, fetch client, and React Query hooks are
   regenerated. Frontends call `useListTodos()` / `mutation.mutate(...)`
   without you wiring anything.

Add an HTTP wiring **only when** the feature genuinely needs a specific
REST shape (third-party callers, webhooks, REST-conventional URLs). Most
in-app features don't.

### Hard rules that always apply

- **`expose: true`** for any function called from a frontend or another
  service. Without it the RPC client won't generate hooks for it.
- **`readonly: true` for queries.** Mark read functions as `readonly: true`
  on the function config. The runner uses this to enforce read-only sessions
  (a write func called under a readonly session is rejected). The RPC layer
  also uses it to pick `useQuery` (cacheable) vs `useMutation` for client
  hooks. Mutations leave `readonly` unset (or `false`).
- **`kind` ⇔ `auth` coupling for HTTP wirings (when you have one).** If the
  function is `pikkuFunc` (session-aware), the HTTP wiring needs
  `auth: true`. `pikkuSessionlessFunc` ⇒ `auth: false`. Mismatching is a
  hard error (PKU573).
- **HTTP method by intent (when you wire HTTP).** Reads → `GET`. Writes →
  `POST`/`PUT`/`PATCH`/`DELETE` per REST conventions.
- **Workflows.** Prefer `pikkuWorkflowGraph` (DSL) over
  `pikkuWorkflowComplexFunc`. `mode: 'inline'` is sync; `'distributed'` is
  queue-dispatched.
- **Auth checks belong on the function or wiring**, not in function bodies.
  Use the `permissions` field with a `pikkuPermission` factory.
- **Throw typed errors** from `#pikku/error` — `NotFoundError`,
  `ConflictError`, `BadRequestError`. Never bare `Error`.
- **Migrations are inline SQL files** in the project's migrations dir
  (typically `sql/`). Use a numbered prefix matching existing files.
- **Secrets and env-vars: NEVER `process.env`.** Declare them with
  `defineSecret` (sensitive) or `defineVariable` (non-sensitive) — both with a
  zod schema for type-safe access. Read variables with
  `services.variables.get('NAME')`. Secrets are **not available in functions** —
  read them in `services.ts` with `secrets.getSecret('NAME')` and pass the value
  into the service the function uses. See the **pikku-config** skill for the full
  pattern (including OAuth2 credentials). This applies even in `config.ts`.

### Conventions to copy from neighbours

Some patterns vary by project; **read a neighbour file before writing**:

- **Function shape**: zod schemas as exported `const`s (`CreateTodoInput`,
  `CreateTodoOutput`) passed to `input`/`output` on the func config — vs
  generic-typed config. Schema name **must match codegen expectations** (the
  exported const name = the schema name in generated `.gen.json`).
- **Imports**: `#pikku` is a namespace, not a module — one subpath per wiring.
  `pikkuFunc` / `pikkuSessionlessFunc` come from `'#pikku/function'`, `wireHTTP`
  from `'#pikku/http'`. Copy what neighbours do.
- **Service usage**: e.g. `kysely`, `redis`. Look at how an existing function
  destructures services from its first arg. **Check `application-types.d.ts`**
  to see whether services like `kysely` are typed (`Kysely<DB>`) or untyped
  (`Kysely<any>`) — that drives whether you can lean on generated DB types
  or have to coerce manually.
- **DB schema namespace**: many projects put tables under a `CREATE SCHEMA`
  (e.g. `app.todos`). Read the first migration in `sql/` to see the
  convention; reuse helper functions/triggers (e.g. `update_last_updated_at`)
  rather than redefining them.
- **HTTP wiring style** (only relevant if you're adding one). Two common
  shapes — match what the project already uses:
  - Per-route `wireHTTP({ method, route, func, auth })`.
  - Single map: `const routes = defineHTTPRoutes({ auth: false, routes: {
fooName: { method: 'post', route: '/foo', func: fooFunc } }}); wireHTTPRoutes(routes)`.

For shared wiring files (e.g. `todos.http.ts` holding both create and list):
create the file with imports if it doesn't exist; **append** wire calls and
add missing imports if it does.

## Stage 5 — Verify

Both must complete cleanly **for your changes** before committing:

```bash
yarn pikku all
# Type-check the workspaces you touched:
cd packages/functions && npx tsc --noEmit
```

Notes on running `tsc`:

- A root-level `yarn tsc` may be a no-op in monorepos that don't define a
  `tsc` script in each workspace. Don't trust an exit-zero from the root if
  no actual checking happened — verify by running `npx tsc --noEmit` in the
  package(s) you touched.

### What "fails" means

**Trust the exit code, not the stderr noise.** `yarn pikku all` may print
warnings, `[PKUxxx]` messages, even `level: critical` log lines, while
still exiting `0` — those are pre-existing project state, not your
problem. Same for `meta context --json`: it streams logs to stderr that
look scary on a clean baseline. The exit code is the source of truth.

If a command exits non-zero, that's a real failure — fix or stop.

### Baseline noise — only your errors matter

Many real-world projects ship with pre-existing warnings or errors
(legacy types, version drift, gen-layer messages). Those are not your
problem; do not "fix" them.

To distinguish your errors from baseline:

1. **Before implementing** (Stage 4), capture the baseline:
   ```bash
   yarn pikku all 2>&1 | tee /tmp/pikku-before.log
   ```
2. **After implementing**, compare:
   ```bash
   yarn pikku all 2>&1 | tee /tmp/pikku-after.log
   diff /tmp/pikku-before.log /tmp/pikku-after.log
   ```

A clean diff means your changes introduced no new issues — even if the
underlying logs both show pre-existing warnings.

If something genuinely failed because of YOUR change, fix the actual issue.
**Do not** mask errors with `as any`, `@ts-ignore`, or `--no-verify`. If
you're stuck, surface the failure to the user — don't hand them a broken
branch.

## Stage 6 — Commit

```bash
git add <the files you changed>
git commit -m "feat: <short title>"
```

Stage the files you actually touched, by path. `git add -A` / `git add .` also
sweeps up regenerated artifacts you didn't mean to commit and, where more than
one agent shares the checkout, another agent's in-progress work — which lands in
your branch and silently breaks theirs.

## Stage 7 — Hand off

Tell the user the branch name and how to review. Two options:

- **Local review:** open the pikku console — the changes view diffs the
  current branch against `main` with pikku-aware structure (added functions,
  new wires, migrations).
- **PR review:** ask before pushing. Once they confirm, `git push -u origin
feature/<slug>` and surface the PR-create URL.

Do not push without explicit confirmation. Do not merge.

## Report what fought you

When pikku itself is what cost you time, report it with `pikku fabric report`.
Nothing is written to the repo; the finding goes to the linked fabric project
and the terminal shows you exactly what was sent.

**Report at the moment it happens**, not at the end from memory — a run that
falls over never reaches its end. One finding per thing that fought you.

### The ladder

1. **Find the quicker workaround.** The user is paying for their feature, not
   for pikku's health.
2. **Investigate** only when there is no workaround, or when the user asks why
   something is slow or wrong.
3. **Report at the depth you already reached.** Never spend extra effort to
   file; never throw away effort you already spent. If the investigation took
   you to the mechanism, the finding says so — named file, named function, what
   is actually happening, and what pikku should do instead.

**Never fix pikku itself.** Not a patch in `node_modules`, not a linked
checkout, not a branch in the framework repo. Many agents each patching pikku to
unblock themselves is many divergent copies and a merge problem nobody signed up
for. Work around it in the app, report it, and let the fix happen once.

### What counts

Anything that cost you time and would cost the next person the same. Most of
these never produce an error: output that is quietly wrong, a generated type
that disagrees with the runtime, a check that passes when it should not, a
narrowing you had to write by hand because the framework should have written it.
**Having to write code the framework should have written for you is a finding.**

So is anything that only shows up in one place — invisible locally, fatal
deployed, or the reverse. Say which, with `--surface`.

Not a finding: a preference, a thing you would have designed differently, or
baseline noise that was already failing before you started.

### Two kinds

- `--kind product` — pikku behaved wrongly. Fixing it is a change to the
  framework.
- `--kind harness` — a skill misled you: it told you to run something that does
  not exist, described a flag that is spelled differently, or contradicted what
  the CLI actually did. Pass `--skill <name>` and `--passage "<the line or
  section>"`. This is the most useful kind to file, because it is fixable
  immediately — so file it even when the cost was small.

### When there was no workaround

Report it anyway with `--unresolved`, and put what you tried and how each
attempt failed in `--tried`. That is what stops the next person walking the same
dead ends. Tell the user what you did instead — abandoned it, shipped something
degraded, or stopped.

`--unresolved` means **no workaround was found**. It does not mean the
workaround was unpleasant.

### The command

```bash
pikku fabric report "<one-line title>" \
  --kind product \
  --model <the model you are> \
  --expected "<what you expected pikku to do>" \
  --actual "<what it did instead>" \
  --command "<the command you ran>" \
  --workaround "<what you did instead, inside the app>"
```

Add whichever of these you actually have: `--error` (the error's message line,
verbatim), `--repro` (the shortest way to reach it again), `--proposal` (what
pikku should do), `--area`, `--surface local|deployed|both`, `--cost` (measured
if you measured it — "98s vs 20s steady" ranks; "slow" does not), `--run` (an id
shared by every finding from this build), `--deploy-target`.

Versions, platform and package manager are read off the installed tree for you.
Do not pass them and do not ask the user for them.

Reporting never fails a build: an unreachable endpoint, an unlinked project or a
logged-out user prints a line and moves on. If it says the finding was not sent,
carry on with the feature — do not try to fix it.

## Hard constraints

The skill's `allowed-tools` does **not** permit:

- `yarn add` / `npm install` / dependency changes (ask the user first)
- `yarn dbmigrate` (never run migrations against the real DB during planning)
- `pikku deploy apply` (never deploy)
- secret writes
- network calls beyond what the implementation requires, except
  `pikku fabric report`, which is explicitly permitted

If the feature genuinely needs any of these, **stop and ask** with a clear
explanation of why and what would change.

## Output discipline

- Stage 2 (intent statement) is plain English, one paragraph.
- Between stages, give one-line updates: "Discovered 30 functions, http+queue
  in use. Drafting intent..." → "Branch `feature/todos` created, implementing..."
  → "`pikku all` clean, `tsc` clean, committed. Review via console or run
  `git diff main`."
- Don't narrate file-by-file. Only surface what's interesting (new patterns,
  judgment calls, things you suppressed).
