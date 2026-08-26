---
'@pikku/cli': patch
'@pikku/skills': patch
---

The hardcoded-copy check stops flagging a feature's own name

Two rules disagreed. `runScenarioFileChecks` requires every `pikkuFeature` to
live in a `*.scenario.ts`, and moving one there is what put it in front of the
hardcoded-copy check — which then flagged the feature's own `name` because the
app catalogue happens to hold the same word:

```
name: 'Downloads',   → ✗ "Downloads" → nav__downloads | downloads__title
```

Complying with the first rule created violations of the second, and the advice
— read the string from the app catalogue — would tie the Console's language to
the product's. `name`, `description` and `template` declared directly on a
`pikkuFeature`, `pikkuScenario` or `pikkuScenarioStep` are Console meta and are
now skipped. A `name` nested deeper — `getByRole('button', { name: 'Speichern'
})` — is a selector built out of UI copy and is still caught.
