---
'@pikku/skills': patch
---

Drop seven single-door skills out of the core install group

`--core` installed a reference skill for every transport whether or not a
project used one. The seven moved here (`pikku-services`, `pikku-queue`,
`pikku-cli`, `pikku-trigger`, `pikku-schedule`, `pikku-schema-ajv`,
`pikku-schema-cfworker`) join the deploy and adapter skills as `--only`
installs, so a project that wires a queue asks for the queue skill.

Measured against 24 fabric build runs, none of the seven was loaded once,
while their descriptions sat in the picker on every turn.
