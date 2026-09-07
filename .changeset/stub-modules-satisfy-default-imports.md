---
'@pikku/cli': patch
---

Stub dead modules as CommonJS so every import shape resolves. The stub was
`export {}`, which has no default export, so a unit reaching
`import postgres from 'postgres'` failed to bundle with "No matching export in
pikku-stub:postgres for import default" — on Cloudflare, where the Postgres
drivers are stubbed precisely because the runtime never reaches them.
