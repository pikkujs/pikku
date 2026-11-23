---
'@pikku/cli': patch
---

An addon in the workspace no longer declares a `namespace`: the main package's `wireAddon({ name, package })` calls choose it, and one addon can be wired more than once. `pikku new addon` stops writing the key.
