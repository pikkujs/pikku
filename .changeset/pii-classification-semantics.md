---
"@pikku/cli": patch
"@pikku/inspector": patch
---

Fix PKU910 classification semantics and Postgres annotation propagation.

**Inspector (`@pikku/inspector`):**
- `findPiiPaths()` now returns `ClassifiedField[]` (path + classification level) so `private`/`pii` and `secret` brands are distinguished
- `Secret<T>` fields are blocked in the output of all exposed functions (sessioned or not)
- `Private<T>` / `Pii<T>` fields are only blocked in sessionless functions — authenticated (sessioned) functions may return private-classified data to their callers

**CLI (`@pikku/cli`):**
- Fix missing `rootDir` in the Postgres `generateSchemaTypes` call — the annotations sidecar file (`db/annotations.gen.json`) was silently ignored during Postgres migrations, causing columns annotated `@public` to remain branded as `Private<T>` in the generated schema
