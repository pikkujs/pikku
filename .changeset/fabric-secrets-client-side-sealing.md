---
'@pikku/cli': minor
---

`pikku fabric secrets set` now seals the value on this machine before sending it. The CLI fetches the stage's public key, encrypts against it, and sends only the sealed blob — so the plaintext never reaches fabric, and the value can be opened by the stage's own worker and by nothing else. `secrets list` returns names and write times; there is no value to show, which is the point.

Both commands were previously calling RPCs fabric no longer serves (`setStageSecret`, `listStageSecrets`) and failing at runtime. `getFabricRPC` returned `any`, so nothing caught it — it is typed now, which is also what surfaced `getDeveloperLiteLLMKey` missing from the bundled RPC map.
