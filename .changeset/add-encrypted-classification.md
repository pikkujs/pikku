---
"@pikku/core": minor
"@pikku/cli": minor
---

Add an `encrypted` data-classification type alongside `public`, `private`, and `secret`.

- **Core (`@pikku/core`):** New `Encrypted<T>` intersection brand (`{ readonly __pii__: 'encrypted' }`) exported from `data-classification.ts`, and `'encrypted'` added to the `Classification` union.
- **CLI (`@pikku/cli`):** The `-- @encrypted[:strategy]` SQL comment annotation is now recognised on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. `pikku db migrate` emits `Encrypted<T>` brands in `schema.d.ts` and records `classification: 'encrypted'` in `classification.gen.ts`. `pikku db audit` counts and lists encrypted columns; because encrypted data is already protected at rest, encrypted columns are not flagged for a missing anonymize strategy.
