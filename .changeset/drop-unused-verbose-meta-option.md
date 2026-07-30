---
'@pikku/cli': patch
---

Drop the unused `verboseMeta` config option

`verboseMeta` was declared on `PikkuCLIConfig`, and so appeared in the generated
`cli.schema.json` as a supported option, but no code path ever read it. Setting
it did nothing; leaving it unset withheld nothing.

The verbose meta files it appeared to gate are written unconditionally:
`writeMetaFiles` emits `<name>-verbose.gen.json` whenever the meta actually
carries verbose fields, alongside the stripped `<name>.gen.json` that runtime
imports. Consumers pick the verbose file up from disk when it is there —
`metaService` prefers it and falls back to the minimal one, and the scenario
coverage RPC reads `pikku-functions-meta-verbose.gen.json` at request time.

The option's only real effect was to mislead: the `pikku-scenario` skill
documented it as required for live coverage, so a `null` coverage report sent
you to a config flag instead of to the actual cause — the verbose meta not
being deployed next to the app. The skill has been corrected.

Removed from the config type and from the templates and verifiers that set it.
Projects carrying `"verboseMeta": true` should drop the key: the generated
schema sets `additionalProperties: false`, so an unknown key fails validation.
