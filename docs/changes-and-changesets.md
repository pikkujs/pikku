# Changes and changesets

Milestones are gone. Every piece of work is a **change**, and the agent that picks
changes up groups related ones into a **changeset**. Knowledge stays the durable
record of what the app is; changes are the ephemeral record of what to do next.

## Why

Milestones were slow (one took ~1.5h with no commit), they under-covered the app
because agents forgot whatever the milestone note left out, and knowledge written
ahead of its milestone broke validation. Changes are small and land one commit at a
time, and every source of work feeds the same queue.

## Where changes come from

- a human circling something on a stage (Fabric) or filing one locally
- the knowledge agent, reconciling knowledge against code
- a pikku upgrade, from the changelog / public-surface diff
- a prompt in an existing project, which becomes changes
- the new-project build, which files the app's first changes

Storage: a local file in OSS, which can be trimmed at any time; a record on Fabric.
The same `changes` commands work against either.

## Changesets

The agent claims the ready changes and groups related ones into a changeset. For
each changeset it declares:

- `creates` / `alters` / `reads`: the tables it touches, taken from the entity
  notes' `resource:` lines
- `needsPlan`: decided by the judge

**The judge.** Hard rules first: creates or alters a table, touches permissions or
scopes, adds an entity, or spans many files → plan. For the grey zone, one cheap
model question. Without a plan, the changeset runs immediately; with one, the
planner writes its plan first.

**Ordering.** A changeset that reads a table waits on the pending changeset that
creates it. Changesets that create or alter tables run one at a time. Everything
else runs in parallel, each in its own worktree. An entity whose table does not exist
yet is *pending*, not a validation error.

**Verification.** At `done`, the diff is checked: a changeset that added a file
under `db/<engine>/` without declaring a table change fails and is re-queued.

## Git

- One commit per change: the message is the change's text, with a `Change: <id>`
  trailer.
- A changeset is a branch, merged with `--no-ff` and a `Changeset: <id>` trailer.
  A changeset that fails its checks is never merged.
- `git log --grep "Changeset: <id>"` is the history once the changes file is
  trimmed.

## The router: `pikku changes next`

A deterministic command decides what runs, so no agent starts by working out the
project's state. It checks these in order:

| State | Agent | Preloaded context |
|---|---|---|
| not a pikku project, with a prompt | new-project build | the prompt |
| a changeset is already running (live lease) | none, exit | |
| open changes | changes | the claimable changes, grouped |
| pikku version moved since the last run | upgrade → files changes | the changelog / surface diff |
| knowledge has gaps against code | knowledge → files changes | the gap list |
| prompt in an existing project | → files changes | the prompt |
| nothing to do | none, exit | |

`pikku changes next --json` prints `{ agent, skill, refs, context }`. `pikku changes next --exec
<harness>` launches it:

- the role skill goes into the system prompt (`--append-system-prompt`)
- the predicted reference skills are preloaded; the rest stay listed and load on
  demand
- the work is the first message (`@context.md`)

**Predicted skills** come from what the changeset touches. With a plan, from the
plan's entries; without one, from the judge's classification; for a circled
element, from its test id. One table maps each kind to skills (tables →
`pikku-kysely`, permissions → `pikku-permissions`, screens → `pikku-react-query` +
`pikku-i18n`, scenarios → `pikku-scenario`, …). A wrong prediction costs a lookup,
not a failure.

Projected subagents (`pikku skills install --agent pi`) inline their skill
(`systemPromptMode: replace`, `skills:`) instead of telling the agent to read it.

## Agents

| Agent | Job |
|---|---|
| main (new-project build, changes) | talks to the user, groups, judges, dispatches; writes no code |
| `pikku-knowledge` | writes knowledge; reconciles it against code and files a change per gap |
| `pikku-architect` | plans one changeset when the judge asks for it |
| `pikku-build` | builds one changeset: a commit per change, then `done` |

## First slice

Before milestones are removed or any skill is rewritten, prove one changeset end to
end on a real app:

1. a local changes store behind the existing `changes` commands
2. `claim` records `creates` / `alters` / `reads` and `needsPlan`
3. `pikku changes next` with two routes: open changes → changes agent; nothing → exit
4. `Change:` commits, the `Changeset:` merge, and the `db/` diff check at `done`
5. 3–4 real changes, one needing a new table, worked through pi
