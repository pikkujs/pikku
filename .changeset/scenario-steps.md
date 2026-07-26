---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

Add `pikkuScenarioStep` — named, typed scenario steps whose body is an ordinary pikku function.

A scenario step is referenced by typed string name, the same way `workflow.do` references an RPC, and is checked against a generated `FlattenedScenarioStepMap`:

```ts
export const buysAnApple = pikkuScenarioStep({
  name: 'buysAnApple',
  description: 'buys an apple',
  func: async (services, data: { qty: number }) => { ... },
})

await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })
// renders: Given the shopper buys an apple
```

- `given`/`when`/`then` are sugar over `step`, setting only the prose prefix. The runner renders a step ladder from the recorded run.
- Steps default to `retries: 0` — a failed assertion is not retried.
- Steps are deliberately **not** registered as RPCs, so a browser-driving step is never network-callable.
- `browser: true` steps receive a browser handle on the wire. `@pikku/playwright` is a new package providing the Playwright-backed provider, signing each actor's browser context in through the same actor path the HTTP actors use. Without a provider, `pikku scenario run --no-browser` **skips** browser scenarios instead of failing them.
- New diagnostics: PKU677 (a `browser: true` step called without an actor) and PKU678 (a step target that is not a static string literal).
- Fixes `--no-<flag>` boolean negation in the CLI command parser, which previously parsed as an unknown option.
- Fixes PKU673 (a scenario func destructuring services), which never fired because it ran before function meta existed; it now runs in post-processing.
- Fixes scenario/workflow steps nested in `for...of` and `Promise.all` being dropped from workflow meta.
