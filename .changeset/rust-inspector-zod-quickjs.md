---
'@pikku/inspector-go': patch
---

The Rust inspector no longer aborts when two schema files reach a module that fails to link. A module that re-exports an unavailable package with `export * from`, or that uses `Intl` while it loads, now converts. A schema built from either is still reported as an error.
