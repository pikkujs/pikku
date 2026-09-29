---
'@pikku/mantine': patch
---

`Radio`, `Checkbox` and `Switch` keep Mantine's statics (`Radio.Group`, `Checkbox.Group`, `Switch.Group`, …). The `original` wrapper dropped them, so those members were `undefined` at runtime while still typing.
