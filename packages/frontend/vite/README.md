# @pikku/vite

The Vite plugins a Pikku frontend needs, behind one line.

```ts
// vite.config.ts
import { pikkuVite } from '@pikku/vite'

export default defineConfig({
  plugins: [tanstackStart(), pikkuVite(), react()],
})
```

`pikkuVite()` reads `pikku.config.json` and applies:

- `testIds()` — adds `data-testid` anchors to JSX for tests and scenarios. With
  `PIKKUSTUDIO_CHANGES_PANEL=true` it also adds the source anchors Pikku Studio's
  changes panel uses.
- `crossSiteSession({ envFile })` from `@pikku/better-auth/vite` — in dev only, and only when
  the project has Better Auth (its generated `auth/auth.gen.ts` exists). `envFile` is
  `clientFiles.envFile`.

`testIds()` is also exported for apps that want it alone.
