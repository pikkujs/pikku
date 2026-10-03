---
type: Overview
title: Knowledge base
description: What this app is, in the Fabric profile of the Open Knowledge Format (OKF).
tags: [meta, okf]
---

# Knowledge base

This folder is the record of **what this app is and why** — short markdown notes, not code.
The planner writes it, the build agent reads it before it writes a line, and both update it
as decisions are made. Nothing gets built until there is a milestone note here to build.

## Record ONLY what pikku can't tell you

Never duplicate anything the platform already gives you for free. Database tables and
columns, function signatures, routes, wirings, permissions, and roles are all discoverable
with `pikku meta` and the database tools — do **not** copy them here. They drift the moment
the code changes, and a stale copy is worse than none.

Knowledge is the context introspection can't surface:

- **Milestones** — the buildable pieces, each carrying the scenario that makes it real
- **Entities** — what the domain's own things are made of, and how they end
- **Decisions and their reasons** — _why_ an approach was chosen, trade-offs accepted
- **Constraints** — external facts (a partner API's quirk, a compliance rule) agreed with the user

## Format — OKF v0.1, Fabric profile

Each note is a markdown file whose **path is its identity**, with YAML frontmatter and a
markdown body. Frontmatter: `type` is required; `title`, `description`, `tags`, `resource`
and `timestamp` are optional. Fabric adds two scalars — `status` (`proposed` → `dispatched`
→ `built`) and `entities` (max 3) — on milestone notes. Cross-link notes with plain markdown
links: that is what makes this a graph instead of a pile of files.

`index.md` is reserved: every directory gets one, linking to its notes, written in the same
turn as the note. Release history is `CHANGELOG.md` at the repo root, not a note here.

## Layout — sections, not loose files

```
knowledge/
  index.md                      # this note: what the project is; links to each section
  milestones/
    index.md
    01-the-daily-entry.md       # type: milestone — one buildable piece, with its scenario
  entities/
    index.md
    entry.md                    # type: entity — what it's made of, how it ends
  decisions/
    index.md
    revocation-ends-a-grant.md  # type: decision — one note per silent decision
    design/
      index.md
      inline-not-toasts.md      # type: decision — how the app looks and behaves
    security/
      index.md
      one-account-one-person.md # type: decision — who may reach what, and why
  questions/
    index.md
    who-owns-a-shared-day.md    # type: note — asked, not answered
  wishlist/
    index.md
    export-to-a-calendar.md     # type: note — one wish per note, never built unasked
```

Only `index.md` ships with the template. **Create a section the turn you have a note to put
in it**, with its `index.md` in the same turn — an empty section is not a placeholder to fill
in later, it is a section that shouldn't exist yet. The sections are load-bearing, not a
style: a build starts only when `milestones/`, `entities/` or `decisions/` holds a note. Flat
`product.md` / `glossary.md` files at this root are **not** a knowledge base — they leave the
project unbuildable.

`decisions/design/` and `decisions/security/` are ordinary decisions kept together because
they accumulate: how the app looks and behaves, and who may reach what. They are _decisions_,
so each carries its reason, not its implementation — the components and the permissions are
in the code, discoverable with `pikku meta`.

`questions/` holds what you asked and never got an answer to; a question that gets answered
becomes a decision note linking back to it. `wishlist/` holds what the user wants one day,
one wish per note — `fabric project wishlist` is where they come from — and is the one
section a build never starts from.

A milestone note carries its scenario as a fenced ```gherkin block written in the **third
person** (`Given 'owner' …`, never `Given I …`), because the scenario runs AS someone. A
quoted word in a step MEANS a persona, wherever it sits in the sentence — so quote the
people and write domain values bare.

There is no `personas/`: the people are declared in the app's own source with pikku's
`definePersonas`, by the build session, because they are the same personas pikku
materialises scenario actors from. The planner names them in gherkin and declares nothing;
`fabric persona` only reads back what the code declared. There is no `scenarios/` or `permissions/` either — a milestone note carries its own
scenario and the rule it enforces.

Keep notes concise and current. Do not store secrets or credentials here.

Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
