# @pikku/knowledge

## 0.12.6

### Patch Changes

- bba64c7: feat(knowledge): a slice is now a milestone

  One concept, two words. The profile called the unit of buildable work a `slice`
  while everything a user reads called it a milestone, so every console rendering
  this graph carried a relabel to hide the difference. The word is now milestone
  everywhere.

  Renamed: `SLICE_STATUSES` → `MILESTONE_STATUSES`, `SliceStatus` →
  `MilestoneStatus`, the `slices` section → `milestones`, `type: slice` →
  `type: milestone`, and the `knowledge-slice-*` findings → `knowledge-milestone-*`.
  Anything matching on a finding id needs the new prefix.

  **This is a break, not a migration.** The old name is not read: a note still
  saying `type: slice` is no longer a milestone to any gate, and a
  `knowledge/slices/` directory is a section the profile does not name — it sorts
  last and carries no description. Rename the directory and the frontmatter.
  `MILESTONE_TYPE` and `MILESTONE_SECTION` are exported for a profile that has to
  write those names itself.

## 0.12.5

### Patch Changes

- 0ab1a88: feat(knowledge): draw a note's scenario and its decision, and say the vocabulary exists

  The console already drew ```mermaid fences as diagrams and `> [!NOTE]` blocks as
  callouts, and nothing told the librarian either existed — the skill that governs
  what goes in a note never mentioned them, so notes were written as prose and
  tables into a renderer that would happily have drawn the graph. The gap was the
  guidance, not the format.

  Two blocks join them. A slice's ```gherkin scenario is drawn rather than
  highlighted: the keywords line up in a column so the shape of the scenario is
  readable before a word of it is, and each quoted persona becomes a chip — which
  also makes a first-person scenario, the form the format rejects, visibly a block
  with no personas in it.

  A new ```decision fence states what a decision note owes: `chosen`, `rules-out`,
`because`. The middle one is the half that gets dropped, so `pikku knowledge
  validate` now warns when a fence says what was chosen and never says what it
  closes off. The fence is optional and a decision argued in prose is still a
  decision — validate checks the fences that exist rather than asking every note
  to be reformatted.

  `Markdown` is exported from `@pikku/console` so the fabric console can render the
  same notes through the same vocabulary instead of a second `<ReactMarkdown>`.

- 5599a27: feat(knowledge): a profile can read its own frontmatter keys, and `designing` joins the slice vocabulary

  `readKnowledgeNotes` now takes the frontmatter keys a profile built on top of
  this one adds — `readKnowledgeNotes(root, ['design', 'route'])` — and returns
  them on the note, typed as `ProfileNote<'design' | 'route'>`. They
  are still not read here: nothing in this package knows what they mean, and the
  reader names them at the call. Without this the only way for a profile to keep
  its own keys was to fork the parser, which is exactly what Fabric had done —
  two copies of the same OKF reader, drifting.

  `designing` is now a slice status. It sits before `proposed`: the slice is
  written down but is NOT to be built yet, because whoever is being shown its
  looks has not picked one. Only `proposed` is dispatchable, so the two cannot be
  one status without a slice being built out from under the person still
  choosing. It was already in use — validating such a project reported every
  milestone under design as `knowledge-slice-bad-status`.

  `checkKnowledgeResources` takes its third argument as an options bag —
  `{ notes, known }` instead of a bare `notes` array — and `known` lets a profile
  add ids it resolves from a source codegen meta does not describe: a live dev
  database's tables, personas from a config file written before anything is
  generated. It is unioned with the meta, never a replacement, so a resource is
  only dangling when neither side has heard of it.

  `buildKnowledgeGraph` carries `statusAt` onto the graph note. It is read off
  frontmatter and typed here already; the graph was the one reader dropping it,
  so a console showing a slice's status could not say how long it had held it.

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.

## 0.12.4

### Patch Changes

- 1065b80: A knowledge note now renders as a document rather than as a wall of markdown,
  and the things it names are links into the app.

  The console's markdown renderer gains the parts of markdown that carry structure
  rather than prose. ```mermaid fences are drawn as diagrams, lazily — mermaid is
  ~1MB of parser and layout engine, imported on the first fence that needs one, so
  a note without a diagram never pays for it. The diagram is themed from the
  console's own CSS variables read off the live element, which is what makes one
  diagram look native in both colour schemes and inside a host console that
  supplies its own values for the same tokens. Only diagrams of STRUCTURE are
  drawn — flowchart, sequence, state, ER, class, journey, timeline, mindmap,
  gitGraph. Mermaid also renders charts, and those deliberately degrade to their
  own source: a chart spends the reader's screen on a handful of numbers a sentence
  carries better, and puts the loudest typography on the page around the least
  important content. A fence that does not parse degrades the same way, with a line
  saying so — notes are written by agents and by people, and a diagram that fails
  silently is worse than one that shows its working.

  `> [!NOTE]`-style callouts (note, tip, important, warning, caution) render as
  callouts, fenced code is syntax-highlighted and copyable in one action, headings
  carry ids so a note can be linked to below its title, and both wide tables and
  wide diagrams keep their intrinsic size inside a focusable, labelled region that
  fades at whichever edge still has content behind it. Scrolling rather than
  scaling, because a fitted diagram keeps its aspect ratio by shrinking its type
  with it, and a flowchart in a narrow pane arrives as an unreadable strip.

  `resource:` URIs are now links. A note that says `func:createEntry` renders it as
  a chip that opens the function, and the same scheme works inline, so a sentence
  can name `[getReport](func:getReport)` and have the reader arrive at it. Standing
  alone the chip shows the whole URI — the kind is half of what it says; inline it
  shows the author's words and drops the box, because a boxed word every few words
  stops a sentence dead. The screens those links land on (functions, workflows,
  wires, jobs, scopes) now seed their search box from `?search=`, which is what
  turns a link into a landing.

  Two prefixes join the scheme in `@pikku/knowledge`: `scope:`, which resolves
  against the permission a function gates itself with and the roles that confer it,
  and `persona:`, against `definePersonas()`. Both are declarations the generated
  meta can check, which is the whole bar for a prefix — a reference nothing
  validates rots into fiction exactly where it looks most authoritative.

## 0.12.3

### Patch Changes

- 6a6675c: Add `decisions/internals` to the knowledge section profile.

  `decisions/design` describes "a rule about how the app looks and behaves", which
  is the right question for an app project and the wrong one for a library: none of
  the reasoning behind `@pikku/core` is about how anything looks. A library filing
  its notes under `design/` reads as UI design to everyone who opens the directory.

  `decisions/internals` — "a rule about how it works under the hood, and why" — is
  the section for that material. `decisions/design` is unchanged and stays the
  right home for app projects.

  Sections outside the profile are not an error, but they lose their description in
  the parent index and their position in the section ordering, so a section worth
  using is worth registering.

## 0.12.2

### Patch Changes

- 457cb25: Add `definePersonas()`: the people a project's scenarios and virtual users run
  as, declared in code.

  There used to be three names for two-and-a-bit things — an _actor_ in
  `scenarios.actors`, a _persona_ in `scenarios.personas`, and a _virtual user_
  declared separately against an actor. In practice almost every actor was its own
  kind, so the second set carried no information and the third was a third place
  for a name to drift. There is now one declaration:

  ```ts
  definePersonas({
    shopper: {
      name: 'Sam Shopper',
      jobTitle: 'Shopper',
      personality: 'Buys in a hurry and leaves tabs open',
      roles: ['customer'],
      disposition: 'careless',
      goals: ['Buy something without reading anything'],
      account: {},
    },
  })
  ```

  A persona is a person: what they are like, what they want, the roles they hold,
  and **one** account they sign in with — `account: {}` plus `linkedAccounts` for
  the rare case of more, modelled on how better-auth does linking. A persona with a
  `disposition` is a virtual user; `runnable: false` marks someone who only ever
  exists to be acted upon — banned, shared with, reset — and is never handed a
  session.

  **A persona names roles, never scopes.** Scopes come from `defineSystemRole()`
  expansion, so the build fails if a persona names a role nobody declared, and
  fails again if a role confers a scope no `defineScope` declares. Running one only
  ever has to check that its roles are still valid.

  **Addresses are computed, never declared.** `personaEmail(id, domain, runId)`
  derives `<id>[+runId]@<domain>` from `scenarios.emailDomain`, so a seed, a
  scenario run and a virtual-user run cannot disagree about who they are signing in
  as. `scenarios.actors` and `scenarios.personas` are gone from
  `pikku.config.json` — only `emailDomain` remains.

  `actor` survives in exactly one place: the name of a **slot in a scenario step**,
  which is the role a persona is cast in for that step. `pikkuVirtualUser()`,
  `kind`, `grants` and the `actor` field are removed; the `actors` service is now
  `personas`, and the CLI's `virtual-user` commands are now `pikku persona list` /
  `pikku persona run`. `budget` and `allowApprovalRequired` moved to run flags —
  how much you will spend today is not a fact about a person.

  `@pikku/cucumber` drops its `Actor` class and `ActorDispatchContext`: a
  hand-rolled cookie jar that a persona's own typed session replaces outright.

## 0.12.1

### Patch Changes

- b89d3b3: Bring the knowledge base into OSS: a package, a CLI gate, a console browser and a skill

  `knowledge/` is where a project records the things `pikku meta` cannot tell you —
  what a slice is for, which rule was chosen and what it rules out, what is still an
  open question. Tables, routes, schemas and permissions are generated, so a note
  that repeats them is a copy that will drift, and the profile refuses the sections
  where that happens.
  - **`@pikku/knowledge`** (new) reads the notes, builds the link graph in both
    directions, and validates the app-project profile: every note typed, every
    section indexed, every slice carrying a third-person gherkin scenario and at
    most three entities, and every `resource:` URI resolving against the generated
    meta. The resource check fails closed on drift and open on ignorance — a prefix
    whose meta is absent is skipped rather than called dangling.
  - **`pikku knowledge validate`** and **`pikku knowledge index`** replace the dead
    three-flat-files check. Both exit non-zero on an inconsistent base, so a
    pipeline can stop on one; `index` refreshes each `index.md` listing while
    leaving the prose around it alone, and now gives a section that holds only
    sub-sections an index of its own instead of leaving it unreachable.
  - **The console** gains a read-only Knowledge page: notes grouped by section,
    a rendered document with its tags, resources, links in both directions and the
    findings against it, and intra-bundle markdown links that open the linked note
    instead of leaving the page. Read-only by design — a note is edited in the repo,
    in the same commit as the code it describes.
  - **The `pikku-knowledge` skill** documents the format for agents, and Fabric
    builds on it rather than restating it.
  - **`@pikku/inspector`**: a zod schema imported from a built workspace package
    resolved to that package's `.d.ts`, which has no runtime exports at all, so
    every schema in it was reported missing. The emitted JS beside it is imported
    instead.
