---
'@pikku/cli': patch
---

`mocks.gen.ts` is only generated when the app or a wired addon has a `.mocks` directory, so projects without mocks never need Vite's `import.meta.glob` types.
