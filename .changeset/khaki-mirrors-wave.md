---
'@pikku/inspector': patch
---

The auth factory's services are read from the auth definition, not from the handler generated out of it.

`pikkuBetterAuth((services) => ...)`'s destructured services are what `authorize` and the session callbacks actually use, and they reach the generated services map by being stamped onto the auth handler's function meta. On the first run in a clean checkout that handler's file has not been written yet — so there is nothing to stamp, nothing to aggregate, and the map comes out marking those services unused. Run it a second time, with the file now on disk, and it says the opposite.

The consequence is not cosmetic: `RequiredSingletonServices` is built from that map, so a clean build types the services as optional and tree-shakes them out of the deployed auth worker — the exact failure the stamping exists to prevent, reintroduced by the one case where it cannot run. A CI checkout is always the first run.

The definition is inspected from hand-written source on every pass, so its services are now folded into the required set directly. A clean build and an incremental one give the same answer.
