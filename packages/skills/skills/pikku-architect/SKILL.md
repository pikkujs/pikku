---
name: pikku-architect
description: >-
  Use to turn one settled milestone note into the technical plan the build is measured against —
  the tables, functions, wires, roles, scopes, screens and scenarios it owes, split into passes and
  written through `pikku knowledge plan set`. This is a SEPARATE SEAT from the build: the plan is
  the denominator `pikku knowledge plan progress` divides by, so whoever writes it must not be the
  one grading themselves against it. TRIGGER when: a milestone note is settled and the next step is
  planning it, the user asks to plan or architect a milestone, `pikku knowledge plan progress` says
  a milestone has no plan, or pikku-build's App mode reaches a milestone with nothing planned. DO
  NOT TRIGGER when: the milestone notes themselves are still being written (use pikku-knowledge),
  the plan already exists and the job is to build it (use pikku-build), or the ask is a one-off
  edit to a working app.
installGroups: [core]
---

# Plan one milestone

A milestone note says what the app must DO and how it must feel for the person using it. It
deliberately does not say how. You are the seat that decides how, once, in writing, before anyone
builds it.

**Why this is a separate seat.** The build agent used to write its own plan. That makes one party
both author and examiner: it can build a fraction, plan only that fraction, and certify itself
complete — and `pikku knowledge plan progress` then divides by a denominator the builder chose
after seeing its own answer. A plan written here, against the note, by someone who is not going to
build it, is the denominator the builder does not own.

**One milestone, one plan, then stop.** Do not build in this session. Do not plan the next
milestone "while you are here" — the notes after this one are still allowed to change, and a plan
written against a note that later moves is worse than no plan.

---

## Write nothing by hand

The plan reaches disk through `pikku knowledge plan set <milestone> <file>` and nowhere else. It
validates first and names the field that is wrong if it refuses; a plan file written with an editor
is a plan nothing checked, and the place that discovers that is a finished build.

It is JSON rather than a note on purpose. Everything else under `knowledge/` is prose a human
reads; this one is consumed field-by-field, and a markdown parser is one more place a misspelt
heading silently passes. It cannot live INSIDE the milestone note either: that note is frozen once
its status leaves `proposed`, so rewriting it would change what the builder was told.

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

Then read, in the tree: the milestone's own note in full, every note it names on `entities:` and
`requires:`, the decisions that constrain it, and the migrations already in `db/sqlite/` — those
say whether your tables are new or an alter.

**Do not re-interview.** If the note leaves something genuinely undecided, plan the reading that
builds LESS. A smaller milestone that ships is worth more than a complete one that does not, and
what you leave out is named in `covers` for the next milestone to pick up.

### 2. Decide the passes

A pass is a slice of the milestone that stands up on its own. **Pass 1 is a walking skeleton**: it
reaches a real screen, with real functions behind it, proved by a real browser scenario. Everything
else waits behind it.

This is enforced, not advisory — `plan set` refuses a plan whose pass 1 has no `ui` item, no
`functions` item, or a pass-1 route with nothing proving it works. The reason is the failure it was
written against: a milestone that built four unwired functions and no page, and reported itself
finished. A build that runs out of time in pass 2 has shipped something; one that runs out of time
having built pass 1 across four half-finished layers has shipped nothing.

**Only pass 1 blocks.** `pikku knowledge plan progress` reports a later pass under `deferred` and
never refuses on it. That is what stops plan size from being fatal — but it is not licence to plan
a milestone nobody could finish. The question that decides a plan's size is not "what does this
note imply" but **"could a build finish all of this if pass 1 took twice as long as I expect"** — if
not, it is two milestones. Plan the first, and say in `covers` what you left behind.

**A screen is what pass 1 reaches only when the milestone IS an app.** The note's `surface:` says
which it is — absent means an app, and `cli`, `mcp`, `agent` and `backend` are the others. On those,
`ui` is legitimately `n/a` (with its reason, like any slot), and pass 1 proves itself one level
down: a pass-1 function that is actually wired, and a `scenarios.backend` item carrying that
function's name in its `fn` field. The obligation never lifts, it only moves — read the surface off
the note before you decide the passes.

### 3. Say what each slot is, or say why it is nothing

Every slot — `model`, `functions`, `roles`, `scopes`, `ui`, and each level of `scenarios` — is
either `{"kind": "built", "description": ..., "items": [...]}` or `{"kind": "n/a", "description":
...}`. **Both carry prose.**

There is no way to leave a slot out, and that is the point: "no roles, because everyone using this
app is the same kind of person" and "nobody thought about roles" must not look alike. Write the
`n/a` reason as a sentence a reader would accept, not as the word "none".

### 4. Write it

```sh
pikku knowledge plan set <milestone> /tmp/plan.json
```

Write the JSON to a file first — the command takes a path, not inline JSON, which is what keeps an
apostrophe in a `description` from ending a shell argument. If it is refused, the refusal names the
field path. Fix that field and send it again; do not restructure the plan around a refusal you have
not read.

Then confirm what the builder will be handed:

```sh
pikku knowledge plan show <milestone> --for-build
```

---

## What the plan holds

The plan holds INTENT. Reality lives in pikku's generated meta under `.pikku/`, which already
inventories every function, wire, scope, role, workflow, agent and scenario. Nothing here
duplicates that — only what codegen cannot infer: **why a thing exists, which pass it belongs to,
and which knowledge note it discharges.**

### `covers` — which notes this milestone discharges

Every plan claims at least one knowledge note: `note` (its path under `knowledge/`), `hash` (what
that note's body hashes to right now) and `complete`.

`complete: false` is the honest answer for a note whose claims span several milestones — claim the
whole of a note only when this milestone genuinely leaves nothing of it unbuilt, because a note
marked complete is a note nobody looks at again.

**You do not have to compute the hash.** Write anything twelve characters long and send the plan:
`plan set` refuses a hash that is not the note's current one and names the correct one, so one
round trip gets you every hash in the plan. That refusal is the point of the field — a hash that
was never right makes the note read as edited-since from the moment the milestone ships, and it
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
workflow entry point. Those last two are not alternate URLs — they are what the milestone IS, and a
plan that omits them ships a `status` column nothing advances or a job nobody runs.

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
finish, and `plan progress` refuses the milestone for as long as it stands.

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

Adding the second frontend is the BUILD's job, at the milestone that first needs it —
pikku-build's multi-app reference. Your part is recording which app each person is in.

### `ui` — routes, and what is on them

One item per route, each with the pass that builds it. A pass-1 route has to be LINKED to the
scenario that proves it, and there are two ways: name the scenario in that `ui` item's own
`scenarios` array, or write a browser scenario whose `feature` contains the route path. Nothing else
counts — an unlinked browser scenario reads as a route nobody proved, and the plan is refused.

### `scenarios` — keyed by level

`backend`, `browser`, `permission`, each its own slot. Keyed rather than tagged so that a plan with
four backend scenarios and no browser scenario fails on its SHAPE — a flat list lets that through,
and that is exactly the milestone that builds an API and ships no screen.

**Every scenario needs `name`: the `pikkuScenario` export it becomes** (`saveEntryScenario`).
`feature` and `scenario` are prose for a reader, and prose cannot be matched against codegen.
`plan progress` looks for the export by that exact name, so a scenario with no name is one the gate
cannot see.

Permission scenarios default to pass 2 — they harden a journey that has to exist before they can
cover it — so a role × resource cross product there costs the milestone nothing.

---

## What makes a plan wrong

`plan set` catches the mechanical failures. These are the ones it cannot:

- **A plan for a different milestone.** The note is about `entries`; the plan builds `projects`.
  Every entity the note names must appear in a function or a table.
- **A pass 1 that is a layer, not a slice.** "Pass 1: the data model. Pass 2: the API. Pass 3: the
  screens." That is three passes of nothing working.
- **Scenarios that assert the code ran rather than that the person got what they came for.** A
  scenario proving `saveEntry` returns 200 proves the wire. The one worth planning is the one where
  a person writes something, comes back, and it is still there. A browser scenario that opens a page
  and asserts it is still on it proves the route loads and nothing else —
  `pikku knowledge plan progress` names it as a problem and refuses the milestone.
- **A permission rule invented here.** If the notes do not say who may do a thing, the answer is
  `null` with the reason, not a rule you made up. A rule the user never agreed to is one they find
  out about by being locked out of their own app.

---

## When you are done

The accepted `plan set` is the end of the seat. Hand the milestone to `pikku-build`, which reads the
plan with `plan show --for-build`, builds it, and closes the milestone only when
`pikku knowledge plan progress` is clean. What you wrote is what it is measured against.
