---
'@pikku/ws': patch
---

Release the `/ecosystem` import fix so the server loads against core 0.12.80

`pikku-ws-server.ts` was moved onto `@pikku/core/ecosystem` alongside every other adapter in #1191, but that changeset listed only `@pikku/core`. `@pikku/ws` declares core as a peer dependency rather than a dependency, so changesets had no edge to follow and never bumped it — the source fix landed on `main` while npm kept serving the pre-move build.

The result is a version pair that resolves cleanly and then dies at import: `@pikku/ws@0.12.5` reaches for `getSingletonServices` on the package root, `@pikku/core@0.12.80` has moved it, and the CLI aborts before it does any work.

```
Failed to run Pikku CLI: The requested module '@pikku/core' does not
provide an export named 'getSingletonServices'
```

Nothing else needs republishing. Of the twenty packages touched by #1191, the rest either got bumped in that release or changed in ways the old root still satisfies; `@pikku/ws` was the only one holding a moved symbol.

No source change here — this exists to give the fix already on `main` a version number.
