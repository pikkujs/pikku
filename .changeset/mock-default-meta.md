---
'@pikku/cli': patch
---

The generated React Query client finds the default mock again when an RPC has more than one. Metas loaded with `import.meta.glob(..., { import: 'default' })` are the meta object itself, and its own `default: true` was mistaken for a module default, so every stub threw "No default mock". Both a module namespace and a plain meta object now work.
