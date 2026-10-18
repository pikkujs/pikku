# Phase 1 — What the app is (§0, §1, §1a, §2)

Part of the app workflow (`app.md` is the index and the rules that hold throughout). Work through §0 to §2 in order, before any code.

## 0. Bootstrap, before anything else

```sh
bunx --bun pikku bootstrap
```

One command, run once, now — not later when you start building. It wires the
`#pikku` import alias the generated code depends on. On a fresh scaffold `.pikku/`
is empty, so **every command that touches codegen fails until this has run** —
including ones you would reasonably reach for while still planning, like
`pikku virtual-user list`. Those failures look alarming (`Cannot find module
'#pikku/workflow/pikku-workflow-types.gen.js'`, `Schema generation failed for 16
schemas`) and they are nothing but this missing step.

`pikku knowledge index` and `knowledge validate` work without it — which is why
the planning phases below are safe either way.

## 1. One more round of questions — then stop asking

Ask **three to five** questions that actually change the schema or the screens,
in one message. Then stop; do not interview the user.

- **Who uses it — who are the distinct kinds of people?** Ask this however small
  the app is. The answer becomes §3's virtual users and roles, and you build only the
  roles they name.
- **What are the two or three core objects?**
- **What is the main thing someone does on their first visit?** This answer
  becomes the second changeset, not the tenth.
- **One app or several?** Separate apps on separate hosts, or one app with paths.
  Cheap to answer now, expensive after the routes exist.
- **What should it look like?** The template ships one theme — "Neutral", a
  deliberately unopinionated monochrome scaffold — and **nothing in the
  open-source toolchain will ever replace it for you.** Accept any of: keep
  Neutral (fine for an internal tool, but say so out loud); a direction in words;
  a reference (brand guide, screenshots, a site whose register they want); or
  their own design agent/prompt, whose output you take as the direction.
- **Do they want to see the screens before you build them?** Offer it here, in
  this same round, with yes marked recommended, in the words of
  the design reference (see SKILL.md) — "a picture of the main screens so you can say 'yes,
  like that' or 'no, move this'", never "mock" or "wireframe". Behind it is one
  HTML page mocking the main screens, a few minutes of work. On a yes, or no
  answer at all, the design reference (see SKILL.md) owns what to make and what it then binds — the
  approved page becomes source of truth for the screens, and the theme is written
  before it so what they approve is what ships. Only an explicit no skips it.
- **May I write test records into the system it talks to?** Ask only when the
  app reads a live system through an addon (an ERP, a CRM) and a changeset needs
  data that isn't there yet: an unpaid invoice, a closed ticket. Say what you
  would create and that it will be marked "Test". A no means building those
  screens against their empty states.
- **What language should the app speak, and what language does the team work
  in?** Two answers, not one — see §1a, which is where they go. Ask only if the
  request is not obviously English; a brief written in English about an English
  product answers both.

Skip anything you can decide yourself. If nobody answers, assume one app with
paths, the roles implied by the request, Neutral, English — and say so.

## 1a. Three languages, and you must not collapse them

A brief saying "the entire UI is German" is about **one** of these. Getting this
wrong has already shipped a project that can never add a second language, so
settle all three explicitly before you write code.

| Axis            | What it covers                                                                                                                      | Where it goes                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Identifiers** | Function, component, type, variable and file names. Database tables and columns. Commit messages.                                   | Nowhere — **always English**, no setting, not negotiable                             |
| **Meta**        | `description` on functions and steps, `name`/`title` on features and scenarios, step `template`, role and virtual user descriptions | `metaLocale` in `pikku.config.json`, default `en`                                    |
| **Product UI**  | Every string the app shows a user                                                                                                   | `messages/<locale>.json`, and `defaultLocale` for what a first-time visitor opens in |

**Identifiers are English.** The product's market does not change this and
neither does `metaLocale`. Identifiers are the surface the generated `#pikku/*`
clients, `pikku info`, the typed RPC map and the Kysely types all bind to, and
unlike a string an identifier cannot be translated later — renaming one is a
migration. A German practice management tool gets `getWorklist`, `case`,
`event`, not `getUebersicht`, `vorgang`, `ereignis`.

**Meta follows `metaLocale`.** Write the team's answer into `pikku.config.json` in
this phase, before there is any meta to be wrong:

```json
{ "metaLocale": "de" }
```

It exists for the Pikku Console. Meta is the one part of a project the Console
renders back to a human, so a team working in German reads their own functions,
features and scenario reports in German. Default `en` and do not ask when the
project is obviously English. **On every later run, read this field first and
author descriptions, titles and step templates in it** — a project whose
`metaLocale` you ignored reports half in one language and half in another.

**Product UI is the message catalogue.** `messages/<locale>.json` via
`pikku-i18n`, with `defaultLocale` deciding what a visitor opens in.
`baseLocale` in `project.inlang/settings.json` **stays `en`**: it names the
message source, the catalogue every other language is cloned from, so a project
that repoints it has nothing to translate from and `--add-locale` is broken
forever.

A German medical portal, correctly:

```jsonc
// project.inlang/settings.json
{ "baseLocale": "en", "locales": ["en", "de"] }
// apps/app/src/i18n/active.json
{ "defaultLocale": "de" }
// pikku.config.json
{ "metaLocale": "de" }
```

Record the two non-obvious answers as a `decisions/` note in §2 — neither is
discoverable from code, and the next agent will otherwise re-derive them wrong.

---

## 2. Write the knowledge graph — before any code

`knowledge/` is not documentation you write at the end. It is the record of what
the app IS, in the words its users use, and it is the one part of the project
another agent picks up and continues from. **Nothing gets built until there is a
note saying what it is.**

Read `knowledge/index.md` and the `pikku-knowledge` skill, then write the notes
for what the user just told you. A project whose `knowledge/` is still only the
shipped index is a project nobody can resume.

Four sections, each answering exactly one question:

- `entities/` — what a thing IS, in the words users use for it
- `decisions/` — what was chosen and what that rules out.
  `decisions/security/` for who may reach what, `decisions/design/` for how it
  looks and behaves
- `questions/` — what you asked and never got an answer to
- `wishlist/` — what someone wants that nobody has asked you to build

Rules that make it a graph rather than a pile of files:

- **A note's path is its identity.** Markdown, YAML frontmatter, `type` required.
  Cross-link notes with plain markdown links — that is what makes it a graph.
- **Create a section the turn you have a note for it**, with its own `index.md`
  written in the same turn. Never scaffold empty directories, and never leave
  notes flat at the root: a `product.md` and a `glossary.md` at `knowledge/` is
  not a knowledge base, and it leaves the project unbuildable.
- **A note says what the app is, never what is left to do.** No status, no
  todo list: the work is filed as changes in §5, and `pikku knowledge gaps`
  says which notes no change builds yet.
- **Record only what pikku cannot tell you.** Tables, columns, function
  signatures, routes, wirings, permissions and roles are all discoverable with
  `pikku info` / `pikku meta`. Copying them into a note gives you a second copy
  that goes stale. Knowledge is the why: decisions, constraints, what a thing
  means.

Three decisions belong here on day one, because every later choice leans on them
and none is discoverable from code:

- **How the product is split into apps**, and why (§4) — `decisions/`
- **What each kind of person may reach**, in domain language — `decisions/security/`
- **What the app should look like** — the direction from §1 (§8) — `decisions/design/`

Then keep it honest — both must pass, and `validate` is a real gate:

```sh
bunx --bun pikku knowledge index
bunx --bun pikku knowledge validate
```
