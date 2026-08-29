---
'@pikku/cli': patch
---

Rename the `locale` field in `pikku.config.json` to `metaLocale`. It sets the language of the meta the Console renders back to your team, not the language your app speaks to its users — a config that still says `locale` now fails with an error saying where the value moved.
