# Harness declarations (experimental)

A harness declares an agent that builds and the gates its work must pass. A
gate is decided by code, a gate agent by a model; both report findings, never a
score. The declarations live in `@pikku/core/harness`, are marked experimental,
and only declare: nothing in Pikku runs a harness yet, and none of it reaches
the app or a deployment.

## Declaring

```typescript
import {
  pikkuHarness,
  pikkuHarnessGate,
  pikkuHarnessGateAgent,
  type HarnessFinding,
} from '@pikku/core/harness'
import type { HarnessGateName } from '#pikku/harness/pikku-harness-gate-names.gen.js'

export const typesGate = pikkuHarnessGate({
  name: 'types',
  description: 'Reports a type error in the change',
  failOn: 'high', // the lowest severity that fails the gate
  workflowTimeout: '5m', // optional, as is workflowRetries
  func: async ({ logger }): Promise<HarnessFinding[]> => [],
})

export const reviewer = pikkuHarnessGateAgent({
  name: 'review',
  description: 'Reads the diff for dead code',
  model: 'cheap', // a model alias
  goal: 'The change adds no unused code',
  failOn: 'high',
})

export const defaultGates = [typesGate, 'format'] as const

export const buildHarness = pikkuHarness<HarnessGateName>({
  name: 'build',
  description: 'Builds one changeset',
  agent: { model: 'default' },
  gates: [...defaultGates, reviewer.with({ failOn: 'medium' })],
})
```

- A **gate** (`pikkuHarnessGate`) is an ordinary function config with a `func`
  that returns `HarnessFinding[]` (`{ file?, line?, severity, rule?, message }`,
  severity `low | medium | high`). `writes` lists the paths it may change and
  defaults to `.pikku/**`; a formatter declares `['**/*.{ts,tsx}']`. Never set
  `expose`.
- A **gate agent** (`pikkuHarnessGateAgent`) has no body: `model`, `goal` and
  `failOn`.
- A **harness** lists its gates by name, by reference to a declared gate or gate
  agent, with `.with({ failOn })` to change one gate's threshold for this
  harness, or as a spread of a `const` array of these. Every entry has to be
  readable from source: a computed list is refused (`PKU124`).

## What codegen writes

`pikku all` writes, under `.pikku/harness/`:

- `pikku-harness-meta.gen.json`: `harnessesMeta`, `gateAgentsMeta` and
  `gatesMeta` (each gate's function meta, with `harness: true`, `failOn`,
  `writes`, `workflowRetries`, `workflowTimeout`).
- `pikku-harness-gate-names.gen.ts`: `HarnessGateName`, the union of every gate
  and gate agent name; pass it to `pikkuHarness<HarnessGateName>` so a typo is a
  type error.

A harness listing a name nobody declares fails codegen with `PKU157`. A gate with
no `func` fails with `PKU236`, a `failOn` that is not a literal severity or a
computed `writes` with `PKU124`.

## What stays out of the app

Gates carry `harness: true` in their function meta, their own marker (scenarios
are marked `scenario`). They are left out of the app's function registrations
and meta, its schema register and every deployment unit, standalone included.
Gates are not RPCs. A harness and its gates are read by whatever runs them,
from the generated meta.
