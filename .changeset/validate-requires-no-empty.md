---
'@pikku/cli': patch
---

`pikku validate` now requires oxlint's `no-empty` rule at `error`, so an empty `catch {}` fails validate. A config that turns the rule off, lowers it, or sets `allowEmptyCatch: true` is reported as `oxlint-rule-missing`, and `pikku enable oxlint` adds the rule and removes `allowEmptyCatch: true`. Each empty block is reported as `oxlint-eslint-no-empty`; a comment inside the block marks a deliberate one. `checksConditionals: false` on `typescript/no-misused-promises` is now detected in the nested shape `oxlint --print-config` prints; before, a resolved config with it switched off passed.
