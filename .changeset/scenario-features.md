---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Add `pikkuFeature`, a grouping primitive for scenarios.

A feature groups scenarios the way gherkin's `Feature:` groups `Scenario:`, and gets `Examples:` for free as an ordinary loop:

```ts
export const credentialFeature = pikkuFeature({
  name: 'Credential API',
  tags: ['credential'],
  before: startsMockOAuthServer,
  after: stopsMockOAuthServer,
  scenarios: [
    credentialLazyLoadScenario,
    ...['stripe', 'google', 'hmac-key'].map((name) => ({
      scenario: credentialRoundTripScenario,
      data: { name },
    })),
  ],
})
```

- Scenarios are referenced by **imported identifier**, not by string name, so a renamed or deleted scenario is a compile error rather than a silent skip. A `{ scenario, data }` entry's `data` is typed against that scenario's own input.
- Feature hooks run **once around the whole group** (`before → a → b → c → after`), not per scenario, and `after` runs in a `finally`. Per-scenario setup stays the scenario's own `before`; gherkin's `Background:` is deliberately not expressible.
- A scenario's effective tags are its own plus its feature's, so `--tags credential` selects through the feature.
- New `--features` selector on `pikku scenario run`, and `pikku scenario list` now prints features with their scenarios indented. Every filter narrows the same plan, so narrowing a feature to two of its five scenarios still runs its hooks exactly once around those two.
- The **feature is the run unit**: `--flows` on a scenario whose every feature entry carries `data` errors and names the features containing it, because the feature is what supplies that data. A scenario referenced bare anywhere, or in no feature at all, still runs standalone.

`pikkuFeature` infers its scenario list with a `const` generic, so `CoreFeature['scenarios']` is `readonly` — otherwise the emitted `addFeature(id, feature)` call does not typecheck.

Membership is resolved at runtime by object identity — `pikkuScenario` returns its config verbatim, so a feature holds the very object that was registered. That is what lets the scenario list be built by a loop, which no static analysis could enumerate. It also means a scenario constructed inline inside a feature is never registered, and is reported as unresolved rather than silently running as something else.
