---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

`definePlugin` takes optional `widgets`, `things` and `arrangedScreens`: an addon's own widgets, cards it can open beside a screen, and screens Studio lays out from widgets fed by a `source` function. A `source` or action `run` names a function of the addon or a project RPC (`'console:listAgents'`). Sources return data only (`variant`, `values`); the words are message keys declared per variant in `copy`. Actions take `label`, `confirm` and `destructive` (which requires `confirm`); arranged screens take `redirect` and `poll`. `pikku all` writes `#pikku/addon/screens` for an addon: `definePlugin` typed against its functions and `messages/en.json` keys, so a wrong `source`, `from`, variant or key fails tsc; core widgets are typed through `WidgetRegistry`, an empty interface Studio fills by augmentation. The inspectors read the new fields statically (PKU345, PKU357, PKU358 cover them), the screens meta and the host's installed addons carry them, and `ui: true` accepts an addon declaring only these. Copy entries nest (numeric names place list items), a value naming a variant is worded by its `$`, and a head's or slot's `figures` are worded by `{ label, note?, value? }`; an action's `run` may be `go:/<path>`. The inspectors follow same-file top-level `const`s and their spreads (not calls or imports), and PKU358 checks nested, `$` and figure keys. The host's `installedAddons` carries widgets, things, arranged screens and their actions as records keyed by id. Nothing existing changes; see docs/MIGRATION.md.
