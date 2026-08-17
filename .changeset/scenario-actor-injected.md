---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Give a persona step its actor instead of making it unwrap one

`requireActor(scenarioStep)` was the first line of every step that acts as
somebody, and it existed because the actor lived on the `scenarioStep` wire as
an optional property. A property of a wire member is either optional for every
binding or required for all of them, so the only expressible answer was
"optional", and each step paid for it with a guard.

The actor is now its own wire member, `wire.actor`, injected by the runner. Wire
members can be required per binding, so a step declares whether it runs as
somebody and the type follows:

```typescript
export const buysAnApple = pikkuScenarioStep<{ qty: number }, { orderId: string }>({
  name: 'buysAnApple',
  actor: true,
  default: async (_services, { qty }, { actor }) => actor.invoke('placeOrder', { qty }),
})
```

A `browser` binding implies it — a window is opened as somebody, so every
binding of a step that has one gets the actor too. A step that declares neither
has no `actor` on its wire at all, rather than an optional one: a pure assertion
over what an earlier step returned has nobody to be, and `attemptsSignIn`
deliberately posts credentials instead of reusing an actor's established
session. That distinction is why the requirement is declared per step rather
than inferred from the step being a persona step — "persona step ⇒ has an actor"
is false, and a guard built on it rejects the 61 steps in the e2e suite that
correctly run without one.

Dispatching a step that declared an actor without `{ actor: actors.x }` now
fails before the body runs, with `ScenarioActorRequired` naming the step.
`ScenarioBrowserActorRequired` is replaced by it, and `requireActor` is gone
from `@pikku/core/scenario` and the generated `#pikku/scenario` barrel.
