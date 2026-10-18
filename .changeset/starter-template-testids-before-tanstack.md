---
'@pikku/cli': patch
---

Starter template: stamp testids before tanstackStart. The testIds vite plugin ran after tanstackStart's route code-splitter, so client and SSR builds anchored different source lines and pages failed to hydrate when the source anchors were on. The plugin now runs its transform with hook order `pre` and sits before `tanstackStart()` in the vite config.
