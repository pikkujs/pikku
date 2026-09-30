---
'@pikku/cli': patch
---

A type an addon's functions take from a built package, such as `TriggerEvent` in a webhook source's receive output, is imported through that package's exported subpath (`@pikku/core/trigger`) instead of a path into its `dist/`, which a consuming app could not resolve.
