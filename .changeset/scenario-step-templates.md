---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Add `template` to `pikkuScenarioStep`, so a step's reported prose names the values it was called with.

`description` documents what a step does, for the console and for whoever reads the source. `template` is what a reader of the report sees, with `{placeholders}` filled from the input the step was actually called with:

```ts
export const seesAddonCard = pikkuScenarioStep<
  { packageName: string; state?: 'installed' | 'available' },
  { visible: true },
  true
>({
  name: 'seesAddonCard',
  description: 'sees an addon in the gallery',
  template: 'sees {state} addon {packageName}',
  browser: true,
  func: async (_services, { packageName, state }, { browser }) => { … },
})
```

```
Then  the admin sees at least 10 addons on offer          ✓  3ms
When  the admin searches for stripe                       ✓  10ms
Then  the admin sees available addon @pikku/addon-stripe  ✓  77ms
```

Previously the only way to get that was a `description` at every call site, which meant writing the sentence once per call rather than once per step — and a call site that forgot it reported the same sentence three times in a row.

- A placeholder with no recorded value renders as nothing and the surrounding whitespace collapses, so an omitted optional input reads as a shorter sentence rather than leaking a literal `{state}` into the report. Type placeholder values so they read as words (`state?: 'installed' | 'available'`, not `installed?: boolean`).
- A call-site `description` still wins, the same way it already won over the step's `description`.
- `renderStepTemplate` is exported from `@pikku/core/workflow` alongside `composeStepProse`, so the CLI reporter and the console render identically.

Scenario steps now record their input on the run (`inlineStep` persisted `null` for every inline step, so there was nothing for a reporter to interpolate). This is what `getRunSteps` already exposes as `data` for RPC steps.

A step called from a loop gets its template too. Its durable name is built at runtime (`sees @pikku/addon-todos`) from a declaration the static meta records verbatim (`sees ${packageName}`), so the two can never match by name — it used to fall back to the bare name, with no keyword, actor or template:

```
        sees @pikku/addon-console                              ✓  85ms
Then    the admin sees installed addon @pikku/addon-console    ✓  92ms
```

The join is by **step function**. A scenario step is dispatched by name exactly as an RPC is, so it now records that name in the run's existing `rpcName` slot — no new field, no schema change in any workflow store. Nothing dispatches off that value anywhere; step identity always comes from the code being replayed.

To keep the slot honest, a scenario step is now its own **kind of RPC**, alongside public / private / remote: `FunctionMeta.scenarioStep` marks it, and `rpcExposed` refuses it even if something marks it `expose: true`. Steps were already left out of the RPC registry; this makes "never network-callable" a property the runtime enforces rather than one the registration path happens to produce.

`collectScenarioStepProse` now returns `{ byStepName, byStepFunc }` rather than a bare `Map`, and `buildStepLadder` takes that. The step name still wins; the function index only decides steps recorded under a name no declaration carries, and a function called from several sites that disagree on their prose is left out rather than guessed at.
