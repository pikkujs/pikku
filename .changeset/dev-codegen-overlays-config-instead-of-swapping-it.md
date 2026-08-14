---
'@pikku/cli': patch
---

Keep the app's own config readable while `pikku dev` regenerates.

Codegen needs the CLI's config, so `pikku dev` overlays it onto the live
singleton services for the length of a regeneration. The services around it were
overlaid key by key, but the config was swapped wholesale — so for as long as
codegen ran (tens of seconds on a large project) every function reading
`services.config` saw the CLI's `pikku.config.json` instead of what
`createConfig` returned. A webhook's host allowlist would vanish mid-flight and
the delivery be refused as an unsafe host.

The config is now overlaid the same way: the CLI's keys win where the two name
the same thing, and the app's survive where they don't.
