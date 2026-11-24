# Attention funcs

An attention func says whether one widget of an addon's arranged screens needs a look right now. A host reads the stored answers of many widgets and lists the ones that do, without opening any screen.

```typescript
// src/health/health.attention.ts
import { pikkuAttentionFunc } from '#pikku/addon/attention'

export const healthAttention = pikkuAttentionFunc({
  widget: 'health.verdict',
  every: '1m',
  func: async (services, { projectKey }, wire) => {
    return { score: 0.7, reason: 'Three requests failed', impact: 3 }
  },
})
```

## Declaring one

| Field    | Meaning                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| `widget` | `<screen>.<slot>`: the id of one of the plugin's own arranged screens and one of its slots. A string literal.       |
| `every`  | How often the stored result is refreshed: whole minutes, hours or days (`1m`, `15m`, `2h`, `1d`). A string literal. |
| `func`   | A normal Pikku function body `(services, data, wire)`. `data` is `{ projectKey }`.                                  |

Declare it in a `*.attention.ts` file. `pikku all` finds every `pikkuAttentionFunc` there and refuses the build, naming the plugin, when a `widget` is not one of its own arranged screens' slots, when two funcs name one widget, or when `every` is not whole minutes, hours or days.

## What it returns

Nothing when all is fine. Otherwise an `AttentionScore`:

```typescript
type AttentionScore = {
  score: number // 0 is fine, 1 is on fire; comparable across funcs and addons
  verdict?: unknown // the card data the widget's own screen produces for the same facts
  reason?: string // one plain sentence for why
  impact?: number // how many things are affected
  since?: string // when it started, an ISO time
}
```

A score outside 0 to 1 is a failure of the run, not a stored result.

## How it runs

Each func is registered as the workflow `attention.<widget>`: a get step (`Check <widget>`) that runs the func and is retried when it throws, then a store step (`Store <widget>`). When the get step still fails after its retries the store step records `failed` with the error, so a host can say "couldn't check" instead of hiding the widget.

Every run is stored per project and widget with the time it finished:

```typescript
type AttentionResult = {
  projectKey: string
  widget: string
  status: 'attention' | 'quiet' | 'failed'
  score?: AttentionScore
  error?: string
  updatedAt: Date
}
```

Results live in the `attentionResults` singleton service (`AttentionResultStore`). With none provided, an in-process store is used, which keeps results until the process ends.

A host keeps results in its own database by implementing the interface as that service:

```typescript
interface AttentionResultStore {
  put(result: AttentionResult): Promise<void>
  get(projectKey: string, widget: string): Promise<AttentionResult | undefined>
  /** Latest run of every widget that has stored one for the project. */
  list(projectKey: string): Promise<AttentionResult[]>
  /** Projects the schedule refreshes for this widget. */
  projectKeys(widget: string): Promise<string[]>
  /** Marks a project as wanting the widget kept fresh, before its first run. */
  watch(projectKey: string, widget: string): Promise<void>
}
```

`updatedAt` on each result is how fresh it is; Pikku owns no table for it.

## Reading and refreshing

The admin addon (`@pikku/addon-admin`) exposes both as functions the host calls:

- `getAttention({ projectKey, widget })` returns the latest stored `AttentionResult`, or `null` when the widget has never run. It checks nothing.
- `refreshAttention({ projectKey, widget })` runs the workflow now and returns what it stored. The project is then refreshed on the func's `every` schedule.

`@pikku/core/attention-func` exports the same two as `getAttention` and `refreshAttention` for code that is not an addon.

The schedule refreshes the projects that have asked (through `refreshAttention`) for that widget. An event hook is left for later: the result is the same whether a run is started by the schedule, on demand, or by an event.
