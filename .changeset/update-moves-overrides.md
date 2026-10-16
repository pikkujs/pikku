---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku update` now moves `@pikku/*` entries in `overrides` and `resolutions` along with the dependency fields. Before, a root override such as `"@pikku/core": "0.12.139"` kept the old version installed after `pikku update --update` had rewritten every range. Nested overrides (objects) are left alone.
