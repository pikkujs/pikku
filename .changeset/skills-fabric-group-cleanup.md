---
'@pikku/skills': patch
---

Correct the `fabric` install group, which had drifted into a catch-all. It now holds only the two skills a Fabric sandbox agent actually needs: `pikku-fabric` and `pikku-ai-voice` (Fabric apps use voice I/O, and it was reaching nobody).

Moved to `core`, because they describe general Pikku work rather than anything Fabric-specific: `pikku-software-archaeology`, `pikku-product-second-opinion`, `pikku-schema-cfworker` (the Fabric template's Workers entry files are generated, so no agent ever writes `CFWorkerSchemaService`), `pikku-deploy-cloudflare` and `pikku-fabric-debug` (Fabric deploys and reads logs through CI, not through the app agent).

Deleted `pikku-tag-middleware`, a tombstone pointing at `pikku-middleware`. It carried no `installGroups`, so it never installed anywhere and only cost a name in the corpus.
