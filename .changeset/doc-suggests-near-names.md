---
'@pikku/cli': patch
---

`pikku doc <name>` suggests the nearest real exports when the name does not exist — a guessed name like `PikkuScenarioWire` is a substring of nothing, so whole-string matching offered no suggestion in exactly the case one is worth having
