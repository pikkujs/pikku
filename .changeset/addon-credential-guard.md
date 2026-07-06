---
'@pikku/cli': patch
---

Guard `wire.getCredential` in the generated per-user credential addon (`new addon --credential`). `getCredential` is optional on the wire services type, so the emitted `src/services.ts` failed `tsc` with "possibly undefined" out of the box; it now checks before calling.
