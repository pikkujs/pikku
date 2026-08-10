---
'@pikku/core': patch
'@pikku/cli': patch
---

feat: give scenarios a `scenario.context` their `before`/`after` hooks can read

A hook only ever received the run's *input*, so teardown could not reach an id
the scenario body minted — which is exactly what a failing run needs to clean
up. `wire.scenario.context` is a per-run scratch object shared by `before`, the
body and `after`. It is typed as a `Partial` of the scenario's output, because a
run that failed early has none of it.

```ts
pikkuScenario<void, { projectId: string }>({
  func: async (_services, _data, { scenario }) => {
    const { projectId } = await scenario.when('creates a project', 'createsProject', …)
    scenario.context.projectId = projectId
    …
  },
  after: pikkuScenarioHook<void, { projectId: string }>(
    async (_services, _data, { scenario, actors }) => {
      if (scenario.context.projectId) {
        await actors.admin.invoke('deleteProject', { projectId: scenario.context.projectId })
      }
    }
  ),
})
```

Deliberately not a world: it is scoped to a single run, and scenario *steps*
cannot reach it — state still flows between steps as return values.

Feature-level `before`/`after` get the same member, scoped to their feature, so
group setup can hand group teardown what it created. It is a separate object
from the scenarios' contexts: one bag shared across a group is the invisible
coupling a Cucumber world had.
