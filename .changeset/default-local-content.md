---
'@pikku/cli': patch
'@pikku/skills': patch
---

dev/serve: always inject the local content service

`pikku dev` and `pikku serve` only built `LocalContent` when `pikku.config.json`
declared a `content` block, so a project without one type-checks, renders and
starts clean and then throws the first time anything uploads a file. Every field
already had a default, so the block was gating a service that needed no
configuration. It is now always constructed; the `content` block still overrides
the storage path, URL prefixes and size limit.

Also documents it in the `pikku-services` skill: these singletons arrive as
`existingServices` and are never named in `services.ts`, so their absence there
is not evidence they are off — which is what makes the `if (!content) throw`
guard the skill already forbids look justified.
