# i18n message extraction (backend-defined translatable text)

## Problem

Backend code defines text that the frontend renders — most visibly **workflow
step names**, but also other metadata. Today that text is hardcoded English and
reaches the console/Fabric as a raw string. There is no way for a consumer to
render it in another language, and no catalog of what *is* translatable.

Two non-solutions we explicitly reject:

- **Hand-maintained key union** — a `type I18nKey = 'a' | 'b' | …` we keep adding
  to. It drifts, it's tedious, and it duplicates information the code already has.
- **Dynamic keys** — `t(someVar)` / `t(`...${x}`)`. Not statically analysable;
  this is the exact "unprovable key" smell already present in the console.

## Approach: build-time message extraction

A well-trodden pattern (gettext/`xgettext`, react-intl `defineMessage` +
formatjs `extract`, Lingui macros, `i18next-parser`): mark translatable strings
with a call the toolchain recognises, then scan source at build time and pull the
literals into a catalog. We apply it to **backend-defined metadata**, not just UI.

### 1. The marker (in `@pikku/core`)

```ts
// identity at runtime — does nothing; exists only so the inspector can find it
export const t = (message: string, params?: Record<string, unknown>) => message
```

- **Literal-only.** Extraction works only on string literals. `t('Deploy')` ✓,
  `t(stepVar)` ✗. The inspector emits a warning on a non-literal first argument.
- **Interpolation via params**, never template strings:
  `t('Deployed {{count}} times', { count })`.
- **Naming:** exported as a deliberately distinct name from the *resolving* `t`
  in `@pikku/react` (they do opposite things). Candidates: `msg` /
  `defineMessage`. (`t` reads nicely inside a step name — decide at impl time.)

Usage in a workflow DSL step:

```ts
.step(t('Deploy to production'), deployFn)
```

### 2. Key-as-message

The English string **is** the key. Lowest friction, and it degrades gracefully:
an unresolved token renders as readable English, not a broken
`workflow.foo.bar`. So a plain console with no catalog still shows English;
Fabric (which has the catalog) shows the real locale.

### 3. Extraction point (the inspector)

The inspector already walks steps and functions (`convert-dsl-to-graph.ts`,
console `useWiringFlow`). It collects every marker literal it finds and emits:

- the **catalog** (seed entries for every token), and
- a generated **key-union type** — so the union is *derived*, not hand-written.

### 4. Catalog lifecycle (CLI codegen)

- **Merge, don't clobber** existing translations.
- Seed new locales as echoes (key = value) so nothing is missing.
- Flag / prune stale keys when a marker is deleted.

(Standard `i18next-parser` behaviour — don't hand-roll naively.)

### 5. Frontend rendering

The service sends tokens; the frontend resolves them against its catalog and
renders whatever language it wants. Consumers (e.g. a customer with their own
locale needs) can ship their own catalog for the same extracted keys.

## Rollout (earn the general case with the narrow one)

1. **Workflow steps first** — marker + inspector extraction + catalog gen for
   step names only. Proves the mechanism end to end.
2. **Generalise** — whole-codebase scan for the core marker; customer-custom
   token catalogs.

## Scope note

This is a genuine `@pikku/core` + inspector + CLI-codegen feature (design,
codegen, release cycle). It is **off the Fabric MVP path** and must not block it.

## Independent, lands now

Typing the 12 `get*NodeConfig(step: any)` builders + `useWiringFlow` against the
existing `WorkflowStepMeta` union (`@pikku/core/workflow`) is a separate, small
fix and does not depend on this feature. The one genuine gap is that
`WorkflowsMeta[0]` doesn't expose `.nodes` / `.entryNodeIds` / `.wires` (hence
the `as any` casts in `useWiringFlow.ts`) — that field surface belongs on the
core type, not a console cast.
