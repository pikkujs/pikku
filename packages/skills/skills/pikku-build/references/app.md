# Build a product on open-source Pikku

You have a scaffolded project with skills installed. This skill owns everything
from here: no hosted account, no card, no hosted build — while keeping the
project shaped so a hosting platform can adopt it later with zero rework.

**Four phases, and you do not skip ahead.** This file is the index: read it,
then open each phase file when you reach that phase, not before. Section
numbers (§0-§9) are stable and are cited elsewhere as "app §N".

| Phase                                                          | Sections                                                            | Read                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| 1. What the app is — write the knowledge graph before any code | §0 bootstrap, §1 questions, §1a three languages, §2 knowledge graph | `references/phase-1-what-it-is.md`      |
| 2. Who it is for — virtual users, roles, frontends             | §3 people, §4 apps                                                  | `references/phase-2-people-and-apps.md` |
| 3. The plan — file the work as changes, in dependency order    | §5 changes, §5a technical plan                                      | `references/phase-3-plan.md`            |
| 4. Build, one changeset at a time                              | §6 build, §6a close against the plan, §6b feed back                 | `references/phase-4-build.md`           |
| 4. Prove it, make it look designed, ship it                    | §7 scenarios, §7a coverage, §8 look and theme (§8a, §8b), §9 ship   | `references/phase-4-prove-and-ship.md`  |

Work through them in order rather than searching. Each changeset repeats §5a,
§6-§7a; §8 and §9 run when the queue is empty (design is read before the first
screen, though — see below).

## Agent Operating Procedure

1. Discover before editing. Run `pikku info functions --verbose --silent` and
   read `AGENTS.md` before your first change. Read `metaLocale` in
   `pikku.config.json` too: it is the language every `description`, `title` and
   step `template` you write must be in (§1a). Identifiers stay English whatever
   it says.
2. Make the smallest source change that satisfies the task. Keep generated files
   generated — never hand-edit `.pikku/`, `*.gen.*`, or the SDK.
3. Validate with the narrowest relevant command, then `pikku all` when functions,
   wirings, schemas or generated clients may have changed.
4. If validation fails, fix the source cause and rerun. Do not paper over
   generated errors by editing generated files.
5. Report at the person's level (SKILL.md, "Who you are talking to"): a console
   link for everything the console can show, and no code unless they are a
   developer.

## Rules that hold in every phase

- **Identifiers are always English**; meta follows `metaLocale`; product UI strings are
  translation keys (§1a, §6).
- **Permissions live in a function's `permissions` field**, never in its body or in a frontend (§4, §6).
- **No `process.env` inside a function**; secrets go through `defineSecret` and the injected `secrets` service (§6, §9).
- **Generated files stay generated** — never hand-edit `.pikku/`, `*.gen.*`, or the SDK.
- **Nothing is built until a knowledge note says what it is** (§2), and a plan is never edited to match what you built (§5a, §6a).
- **Every changeset ends proven**: a passing scenario including its refusals (§7), screens looked at (§6), functions covered (§7a).
- **One approval, then build to the end** (§5). Stop only for what is theirs to decide.

## Reference

Read these when the section that names them comes up, not up front. SKILL.md
says when to open each one:

- multi-app — adding a second frontend (§4), at the changeset that needs it
- scenarios — writing journeys that stay proven (§7, §7a)
- design — committing to a design direction, and how to tell whether the
  screens realise it. Read BEFORE the first screen (§6), not at §8
- theming — authoring the theme (§8a)
- ship — deploying, and the deploy-readiness contract (§9)
- Sibling skills: `pikku-knowledge` (§2), `pikku-auth` (§3),
  `pikku-scenario` (§7, §7a), and `pikku-deploy` (§9)
- Project conventions written by the template: `AGENTS.md`
- Doing less than this: the quick reference. Doing more: the platform reference (both in SKILL.md).
