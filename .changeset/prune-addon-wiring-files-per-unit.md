---
'@pikku/inspector': patch
---

Prune a unit's addon wiring files alongside its addon declarations, so a
deployment unit no longer imports (and registers) addons whose functions the
unit filter dropped. `wireAddon` now records the app file that declared it, and
a file is dropped only when every addon it wires is dropped.
