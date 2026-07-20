---
'@pikku/console': patch
---

Soften the dev console chrome: drop borders in favour of flat fills and give the
shell header a touch more height.

- Set every `*-border` theme token to `transparent` (dark + light) and zero the
  Badge border, so the pervasive hairline rules disappear without restructuring
  any layout.
- `ShellHeader` grows from 45px to 50px and loses its bottom rule.
- Neutralise the remaining hardcoded (non-token) borders that the token sweep
  couldn't reach — the coloured tag borders in Schedulers/Triggers/Channel
  tabs, the run-selector outline, and the database result-table rules.

Functional/diagram borders are intentionally kept (flow-node rings, the active
tab underline, the overlapping-avatar separators).
