---
name: pikku-feature
description: 'Drive create-a-feature work for a Pikku project: discover project context, work on a feature branch, implement + verify + commit, and ask the user to review via the diff. TRIGGER when: the user asks to "create a feature", "build a todo app", "add X to my Pikku project", "wire up a new endpoint", or anything that implies turning a natural-language request into Pikku functions/wirings/migrations. DO NOT TRIGGER when: the user asks for a one-off code edit in an existing function, or asks about Pikku concepts (use pikku-concepts).'
allowed-tools: Bash(yarn pikku meta *), Bash(yarn pikku all *), Bash(yarn tsc), Bash(git status *), Bash(git diff *), Bash(git switch *), Bash(git checkout *), Bash(git checkout -b *), Bash(git add *), Bash(git commit *), Bash(git log *), Bash(git branch *)
argument-hint: '<feature description>'
---

# Pikku Create-a-Feature

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

## Stage 2 — State intent in plain English (BEFORE writing code)

Before touching any files, give the user one paragraph stating exactly what
you'll do. This is the lightweight "plan" — it is chat, not JSON.

> I'll add a `todos` table via a new migration in `sql/`, two `pikkuFunc`s
> (`createTodo`, `listTodos`) in `packages/functions/src/functions/`, and an
> HTTP wiring at `packages/functions/src/wirings/todos.http.ts`. No new
> dependencies. OK to proceed?

Wait for the user to confirm or redirect. They can ask for changes ("use the
existing tasks table" / "make it a queue not http") in normal chat — no
schema, no JSON, no ceremony.

## Stage 3 — Branch off

After confirmation, ensure the working tree is clean and create a feature
branch off the current main/develop branch:

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

Hard rules that always apply:

- **`kind` ⇔ `auth` coupling.** If the function is `pikkuFunc` (session-aware),
  its HTTP wiring needs `auth: true`. `pikkuSessionlessFunc` ⇒ `auth: false`.
  Mismatching is a hard error (PKU573).
- **`readonly: true`** marks queries (no side effects, cacheable). For HTTP,
  readonly funcs typically use GET; mutations use POST/PUT/PATCH/DELETE.
- **Workflows.** Prefer `pikkuWorkflowGraph` (DSL) over
  `pikkuWorkflowComplexFunc`. `mode: 'inline'` is sync; `'distributed'` is
  queue-dispatched.
- **Auth checks belong on the wiring**, not in function bodies. Use the
  `permissions` field with a `pikkuPermission` factory.
- **Throw typed errors** from `@pikku/core/errors` — `NotFoundError`,
  `ConflictError`, `BadRequestError`. Never bare `Error`.
- **Migrations are inline SQL files** in the project's migrations dir
  (typically `sql/`). Use a numbered prefix matching existing files.

For shared wiring files (e.g. `todos.http.ts` holding both create and list):
create the file with imports if it doesn't exist; **append** wire calls and
add missing imports if it does.

## Stage 5 — Verify

Both must pass before committing:

```bash
yarn pikku all
yarn tsc
```

If either fails, fix the actual issue. **Do not** mask errors with `as any`,
`@ts-ignore`, or `--no-verify`. If you're stuck, surface the failure to the
user — don't hand them a broken branch.

## Stage 6 — Commit

```bash
git add -A
git commit -m "feat: <short title>"
```

## Stage 7 — Hand off

Tell the user the branch name and how to review. Two options:

- **Local review:** open the pikku console — the changes view diffs the
  current branch against `main` with pikku-aware structure (added functions,
  new wires, migrations).
- **PR review:** ask before pushing. Once they confirm, `git push -u origin
  feature/<slug>` and surface the PR-create URL.

Do not push without explicit confirmation. Do not merge.

## Hard constraints

The skill's `allowed-tools` does **not** permit:

- `yarn add` / `npm install` / dependency changes (ask the user first)
- `yarn dbmigrate` (never run migrations against the real DB during planning)
- `pikku deploy apply` (never deploy)
- secret writes
- network calls beyond what the implementation requires

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
