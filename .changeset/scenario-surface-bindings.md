---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/skills': patch
---

scenario: replace `browser: true` + `func` with per-surface bindings on `pikkuScenarioStep`

A step now declares one implementation per surface it can be driven through:

```ts
export const buysTheItem = pikkuScenarioStep<{ sku: string }, { orderId: string }>({
  name: 'buysTheItem',
  description: 'buys the item',
  browser: async (services, data, { browser }) => { ... },
  default: async (services, data, { rpc }) => { ... },
})
```

`pikku scenario run --run browser|cli|default` picks which surface the run drives,
and the two phases resolve bindings differently:

- **Actions** (`given` / `when` / `step`) run exactly one binding — the run
  surface if it has one, otherwise `default`. A step with neither now fails with
  `ScenarioNoSurfaceBinding` instead of silently running server-side.
- **Assertions** (`then`) are witnesses, not alternatives: every declared binding
  runs and they must agree. Two surfaces reporting different things fails the run
  with `ScenarioWitnessDisagreement` rather than reporting a pass. An assertion
  with no witness the run can execute at all fails with `ScenarioNoWitness` —
  without it the step returns `undefined` and renders as a tick, reporting a pass
  for something nobody checked.

A scenario written as a step ladder that never calls `then` is now a **PKU680**
critical. It proves only that nothing threw, so an assertion-free ladder of
browser-bound actions would score perfect coverage while checking nothing.

The report gains a surface-coverage line — `n/m steps ran on browser`, counted
over every step, so an action that fell back to the server lowers the ratio
rather than needing a footnote. That also makes surfaces comparable over one
denominator: a scenario is `4/4` on a default run and `3/4` on a browser one.
Assertions that fell back are named separately and gate `--strict`, since a
sentence claiming the actor saw something nobody looked at is a different problem
from an action taking a shortcut.

**Breaking:** `browser: true` and the third `B extends boolean` type argument are
gone. Rename `func` to `default` (or to `browser` where the step drove a browser)
and drop the type argument.
