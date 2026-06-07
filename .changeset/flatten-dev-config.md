---
"@pikku/cli": minor
---

Flatten `createConfig` dev fields: replace `dev: { db, content }` with top-level `sqliteDb: string` and `content: { contentPath?, uploadUrlPrefix?, assetUrlPrefix?, sizeLimit? }`.

**Migration:** update your `createConfig` export:

```ts
// before
export const createConfig = pikkuConfig(async () => ({
  dev: { db: true, content: true },
}))

// after
export const createConfig = pikkuConfig(async () => ({
  sqliteDb: '.pikku-runtime/dev.db',
  content: {},
}))
```

For test helpers that override the db path, replace `{ ...config, dev: { db: { file: dbFile } } }` with `{ ...config, sqliteDb: dbFile }`.
