---
'@pikku/cucumber': patch
---

fix(cucumber): stop failing the page sweep on cancelled requests

A `net::ERR_ABORTED` means the browser tore a request down in flight — nobody
ever answered — so it is never on its own evidence of an app bug. A broken
endpoint answers with a status (already caught as `apiErrors`/`HTTP <status>`)
and a broken page throws (already caught as `pageErrors`/`consoleErrors`).

The sweep previously exempted aborts only under `node_modules`, on the theory
that Vite's dep-optimizer was the only source. It isn't: any HMR full-reload
cancels everything in flight at that instant — app source (`/src/Foo.tsx?t=…`),
workspace files served through `/@fs/`, and the page's own `/api/…` calls — and
only the `node_modules` subset was exempt, so every other reload artifact was
reported as a runtime error.

All aborts are now filtered out of the reported problems and still count as
transient, so the existing retry re-reads the page and a real error hiding
behind the reload is reported on the next attempt.
