---
"@pikku/inspector": minor
---

Add version awareness to RPC handler: versioned functions now appear in the exposed RPC type map (e.g. `getData@v1`, `getData@v2`), enabling type-safe `rpc.invoke('getData@v1', data)` calls. Tree-shaking respects specific version filters without pulling in all versions. HTTP wirings correctly resolve versioned function IDs.
