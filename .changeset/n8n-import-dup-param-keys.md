---
'@pikku/n8n-import': patch
---

fix(n8n-import): collapse duplicate n8n header/query param names (TS1117)

n8n keypair collections (HTTP `headerParameters` / `queryParameters`) allow the
same name more than once — a copy-pasted `Sec-Fetch-Dest` header, a repeated
`type` query param. Serializing each pair into a JS object literal produced
duplicate keys, which don't compile (`error TS1117`). `emitParamObject` now
collapses duplicates last-wins (the JS object-literal runtime rule), keeping
each key at its first position. Clears the entire TS1117 cluster in the corpus.
