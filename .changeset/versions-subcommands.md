---
'@pikku/cli': patch
---

Version management commands are now grouped under `pikku versions <subcommand>`:

- `pikku versions init` — initialise the version manifest (was `pikku init`)
- `pikku versions check` — validate contracts against the manifest (was `pikku versions-check`)
- `pikku versions update` — update the manifest with current hashes (newly exposed as a CLI command)
