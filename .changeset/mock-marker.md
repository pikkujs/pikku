---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector-go': patch
---

A function can be declared `mock: true`: input and output, no `func`. `pikkuFunc` and `pikkuSessionlessFunc` refuse a config with both or neither. The inspectors (Go and Rust) record `mock: true` in the function meta and keep the function in every map and client, but leave it out of the version manifest. Calling a mocked function on a backend fails with a 501 naming it. `pikku info functions --mock` lists the mocked functions, `pikku meta functions` shows the flag, and `pikku validate` reports each one as an error (a warning under `--skipDeployChecks`).
