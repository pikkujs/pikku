---
name: pikku-architect
description: >-
  Use to turn one claimed changeset into the technical plan its build is measured against —
  the tables, functions, wires, roles, scopes, screens and scenarios it owes, split into passes and
  written through `pikku knowledge plan set <changeset>`. The plan is the denominator
  `pikku knowledge plan progress` divides by, so it is written BEFORE any of the changeset's code
  exists and never edited afterwards to match what got built. TRIGGER when: `pikku changes
  claim` says a changeset needs a plan, `changes done` or `pikku changes next` refuses one for having no
  plan, or the user asks to plan or architect a changeset. DO NOT TRIGGER when: the knowledge notes
  themselves are still being written (use pikku-knowledge), the plan already exists and the job is
  to build it (use pikku-changes), or the changeset was claimed with no plan needed.
installGroups: [core]
agent:
  tools: read, write, edit, bash, grep
  timeoutMs: 1800000
  acceptance:
    level: verified
    evidence: [changed-files, validation-output]
    verify:
      - id: knowledge-consistent
        command: pikku knowledge validate

---

# Plan one changeset

A changeset's changes say what the app must DO, in the words of the person who filed them, and the
knowledge notes say what the app is. Neither says how. This is where how gets decided, once, in writing, before any of
it is built.

**Why the plan comes first and stays fixed.** A builder who plans after seeing its own work can
build a fraction, plan only that fraction, and certify itself complete — `pikku knowledge plan
progress` then divides by a denominator chosen after the answer. The defence is the ORDER: the plan
is written against the changes, in its own turn, before a single migration for it exists, and is never
edited afterwards. An item that will not land is deferred with its reason through `plan defer`,
not rewritten out of the plan. The same agent plans and then builds; nothing hands off.

**One changeset, one plan, then build it.** Do not plan another changeset "while you are here" —
its changes are still allowed to move, and a plan written against work that later moves is worse
than no plan.

**When a changeset needs one.** `changes claim` decides: a changeset that creates or alters a table,
or one with many changes, is planned; anything else is put to the configured judge, and a judge that
fails says plan. The claim prints which, and why. `changes done` then refuses the first change of a
planned changeset until its plan reads, and the last until the plan's first pass exists; `pikku changes next`
will not merge it without the plan on its branch.

---

## Write nothing by hand

The plan reaches disk through `pikku knowledge plan set <changeset> <file>` and nowhere else —
`knowledge/plans/<changeset>.plan.json`, where `<changeset>` is the group id the claim printed.
Commit it on the changeset's branch, before the first change, so it merges with the code it
describes. It
validates first and names the field that is wrong if it refuses; a plan file written with an editor
is a plan nothing checked, and the place that discovers that is a finished build.

It is also written ONCE. `plan set` refuses a changeset that already has a plan: the plan is the
order the build is measured against, and an order that can be rewritten measures nothing. The one
way down from a written plan is `pikku knowledge plan defer <changeset> <item> --reason <why>`,
which records what was left out and why.

It is JSON rather than a note on purpose. Everything else under `knowledge/` is prose a human
reads; this one is consumed field-by-field, and a markdown parser is one more place a misspelt
heading silently passes.

## Send it. Do not go looking.

```sh
pikku knowledge plan schema
```

That is the specification, in full, with every field's guidance in its `description`. There is no
second plan-format doc. So when you are unsure what a field wants, **write your best honest reading
and send it** — `plan set` validates every field and names the exact one that is wrong, so a wrong
guess costs one round trip and teaches you the answer.

The failure mode to recognise in yourself: you have decided the tables, the passes and the
functions, and you are still reading. That is the moment to run `plan set`.

---

## The turn

### 1. Read what has been settled

```sh
pikku knowledge validate          # the base is consistent before you plan against it
pikku meta context --json         # what the app already declares
pikku knowledge plan schema       # the only spec for what you are about to write
```

Then read the changeset's changes in full (`pikku changes show <n>` for each), every
knowledge note they touch — the entity notes, and the note a change's `Knowledge:` line names — the
decisions that constrain them, and the migrations already in `db/sqlite/`: those say whether your
tables are new or an alter.

**Do not re-interview.** If a change leaves something that alters the schema or a screen genuinely
undecided, `pikku changes ask` on it and plan the rest; otherwise plan the reading that
builds LESS. A smaller changeset that ships is worth more than a complete one that does not, and
what you leave out is named in `covers` for the next changeset to pick up.

### 2. Decide the passes

A pass is a slice of the changeset that stands up on its own. **Pass 1 is a walking skeleton**: it
reaches a real screen, with real functions behind it, proved by a real browser scenario. Everything
else waits behind it.

This is enforced, not advisory — `plan set` refuses a plan whose pass 1 has no `ui` item, no
`functions` item, or a pass-1 route with nothing proving it works. The reason is the failure it was
written against: a changeset that built four unwired functions and no page, and reported itself
finished. A build that runs out of time in pass 2 has shipped something; one that runs out of time
having built pass 1 across four half-finished layers has shipped nothing.

**Only pass 1 blocks.** `pikku knowledge plan progress` reports a later pass under `deferred` and
never refuses on it. That is what stops plan size from being fatal — but it is not licence to plan
a changeset nobody could finish. The question that decides a plan's size is not "what does this
note imply" but **"could a build finish all of this if pass 1 took twice as long as I expect"** — if
not, it is two changesets. Plan the first, and say in `covers` what you left behind.

**A screen is what pass 1 reaches only when the changeset reaches people through an app.** The
plan's `surface` says which — `app` by default, and `cli`, `mcp`, `agent` and `backend` are the
others. On those,
`ui` is legitimately `n/a` (with its reason, like any slot), and pass 1 proves itself one level
down: a pass-1 function that is actually wired, and a `scenarios.backend` item carrying that
function's name in its `fn` field. The obligation never lifts, it only moves — decide the surface
before you decide the passes.

### 3. Say what each slot is, or say why it is nothing

Every slot — `model`, `functions`, `roles`, `scopes`, `ui`, and each level of `scenarios` — is
either `{"kind": "built", "description": ..., "items": [...]}` or `{"kind": "n/a", "description":
...}`. **Both carry prose.**

There is no way to leave a slot out, and that is the point: "no roles, because everyone using this
app is the same kind of person" and "nobody thought about roles" must not look alike. Write the
`n/a` reason as a sentence a reader would accept, not as the word "none".

### 4. Write it

```sh
pikku knowledge plan set <changeset> /tmp/plan.json
```

Write the JSON to a file first — the command takes a path, not inline JSON, which is what keeps an
apostrophe in a `description` from ending a shell argument. If it is refused, the refusal names the
field path. Fix that field and send it again; do not restructure the plan around a refusal you have
not read.

Then confirm what the builder will be handed:

```sh
pikku knowledge plan show <changeset> --for-build
```

---

## What the plan holds

The plan holds INTENT. Reality lives in pikku's generated meta under `.pikku/`, which already
inventories every function, wire, scope, role, workflow, agent and scenario. Nothing here
duplicates that — only what codegen cannot infer: **why a thing exists, which pass it belongs to,
and which knowledge note it discharges.**

### `covers` — which notes this changeset discharges

Every plan claims at least one knowledge note: `note` (its path under `knowledge/`), `hash` (what
that note's body hashes to right now) and `complete`.

`complete: false` is the honest answer for a note whose claims span several changesets — claim the
whole of a note only when this changeset genuinely leaves nothing of it unbuilt, because a note
marked complete is a note nobody looks at again.

**You do not have to compute the hash.** Write anything twelve characters long and send the plan:
`plan set` refuses a hash that is not the note's current one and names the correct one, so one
round trip gets you every hash in the plan. That refusal is the point of the field — a hash that
was never right makes the note read as edited-since from the moment the changeset ships, and it
drops back into a backlog nobody planned.

### `model` — tables, and what their columns HOLD

Each field carries a `classification`: `public`, `internal`, `personal` or `sensitive`. That is what
lets a permission claim be checked against the data rather than only against itself — a function
returning a `personal` column with no permission rule is a defect the gate can name. It is also what
`db/annotations.ts` ends up expressing, so plan it here rather than discovering it at migrate time.

Each relationship carries `onDelete`: `cascade`, `restrict` or `orphan`. A foreign key states which
rows are related; it does not state what the product wants when the parent goes, and those three
produce identical schemas until someone deletes something. A `cascade` is checked against the
migrations by `plan progress`, and needs `provedBy` naming a scenario in this same plan that deletes
the parent and asserts the children are gone.

A table that already exists is altered by a NEW forward migration, numbered on from the ones in
`db/sqlite/`. Editing an applied migration is the hash mismatch that makes a deployed database
refuse to migrate, so plan the alter as its own file.

### `functions` — with their wire and their rule on them

The wire and the permission live ON the function, because that is where pikku enforces them. Two
parallel lists are two lists that drift.

**Do not give a function a `wire`.** pikku already serves every `expose: true` function as an RPC
and the client calls it by name, so for nearly every function there is nothing to decide — leave the
field out. A `wire` is for the exceptions: its own HTTP path via `wireHTTP` (a webhook, a payment
callback, a public URL another system posts to), a queue job, a channel, a scheduled task, or a
workflow entry point. Those last two are not alternate URLs — they are what the changeset IS, and a
plan that omits them ships a `status` column nothing advances or a job nobody runs.

A wire is also a constraint on the function's SHAPE, not only an address for it. `wireScheduler`
takes a function of `void` to `void` — the clock passes nothing and reads nothing back — so a
function that answers with a report cannot be the one on the clock. One plan here put
`wire: scheduler` on a nightly collector whose output was the counts a member of staff needed to
see, and the build had to split it in two: a void shell for the clock, and the exposed collector it
calls. That was the right answer, but it was a design decision made mid-build because the plan had
not asked what the wire would accept. Before you write a wire, name what that wire hands the
function and what it does with the answer; where the two disagree, plan BOTH halves.

`permission` is a SENTENCE, not a role name — "only the person who wrote it can edit it". The roles
are the engineer's choice; the rule is the part that has to survive being implemented, in the
function's `permissions` field and never in its body. `null` means open to anyone signed in, and
stating that is different from omitting it. **Every function with a permission rule needs a
permission scenario naming it in `fn`** — a rule with no failing case is a claim, not a check, and
`plan set` refuses the plan without one.

### `scopes` — what a KIND of user may do, never who owns a row

A scope depends ONLY on the session: "may this kind of user do this at all" — `admin:invoices:void`,
`billing`. It is declared with `wireScope` and granted in `mapSession`, so every name here has to
end up in pikku's generated scope meta. One that cannot be declared is one the build can never
finish, and `plan progress` refuses the changeset for as long as it stands.

Ownership is not a scope. "Only the owner of the house may read it" depends on the row being asked
for, and a scope never sees the row — that is the function's `permission` sentence and lives nowhere
else. If the rule mentions the record, it is a `permission`; if it reads the same for every row that
user touches, it is a scope. An app built from one person's idea usually has none at all, so
`{"kind": "n/a", ...}` is the ordinary answer here.

### `roles` — and the app each one signs into

The distinct `app` values across `roles` ARE the frontends this project gets, and nothing downstream
can recover the answer. Colleagues share ONE app and differ by nav and permitted actions (the
mechanic, the person on the counter, the bookkeeper); someone across the counter with an account
gets their own (the customer, the tenant, the patient). One app is a real answer and often the right
one — then every role carries the same slug. Never invent a person the notes do not name in order to
reach two, and never give a slug to someone who never signs in: a guest checking out takes the same
slug as the seller they buy from, on that app's public routes outside `/app`. Once there is more
than one app, every `ui` item carries its `app` too.

Adding the second frontend is the BUILD's job, at the changeset that first needs it —
pikku-build's multi-app reference. Your part is recording which app each person is in.

### `ui` — routes, and what is on them

One item per route, each with the pass that builds it. A pass-1 route has to be LINKED to the
scenario that proves it, and there are two ways: name the scenario in that `ui` item's own
`scenarios` array, or write a browser scenario whose `feature` contains the route path. Nothing else
counts — an unlinked browser scenario reads as a route nobody proved, and the plan is refused.

### `scenarios` — keyed by level

`backend`, `browser`, `permission`, each its own slot. Keyed rather than tagged so that a plan with
four backend scenarios and no browser scenario fails on its SHAPE — a flat list lets that through,
and that is exactly the changeset that builds an API and ships no screen.

**Every scenario needs `name`: the `pikkuScenario` export it becomes** (`saveEntryScenario`).
`feature` and `scenario` are prose for a reader, and prose cannot be matched against codegen.
`plan progress` looks for the export by that exact name, so a scenario with no name is one the gate
cannot see.

Permission scenarios default to pass 2 — they harden a journey that has to exist before they can
cover it — so a role × resource cross product there costs the changeset nothing.

---

## What makes a plan wrong

`plan set` catches the mechanical failures — a missing slot, a bad hash, a pass 1 with no `ui` item.
Read your draft back against these six questions, which it cannot ask. Each has cost a real
changeset; **[references/plan-defects.md](references/plan-defects.md)** carries the case behind every
one, and is worth opening for any question you cannot answer with a flat yes.

1. **Is this a plan for THESE changes?** Every entity the changes and their notes name appears in a function or a table.
2. **Does pass 1 slice, and does the model fit inside it?** Not "pass 1: the data model, pass 2: the
   API" — and `model` holds only the tables pass 1 or 2 actually migrates, because the model slot has
   no passes and a later table is a PROBLEM from the first day.
3. **Can each scenario actually be performed?** Name the persona; assert what the person got rather
   than that the code ran; write totals as deltas against a database nobody resets; check that every
   input the prose describes is a field somebody planned.
4. **Does something produce every state and field the plan reads?** For each clause of a description,
   each screen the opening paragraph names, each field you filter or badge on, and each state a
   scenario waits in — name the function that gets the world there. A producer you are reusing is
   checked against code that already exists; a producer this changeset is adding is checked against
   the plan that adds it. What is never allowed is a state with no named producer at all.
5. **Can two sentences in the plan both be true?** Write a state machine out once as a table in
   `model`, name who sets and reads every clock in it, and say whether saving a child collection
   REPLACES it or ADDS to it.
6. **Did you invent anything?** If the notes do not say who may do a thing, that is `null` with a
   reason, not a rule you made up.

---

## When you are done

The accepted `plan set` is the end of planning. Commit the plan file on the changeset's branch, then
go straight on to the build in `pikku-changes`: read the plan with `plan show --for-build`, build it
one commit per change, and mark the last change done only when `pikku knowledge plan progress` is
clean — `changes done` checks the same thing and refuses until it is. What you wrote is what you are
measured against, so do not touch it once the first migration is open.
