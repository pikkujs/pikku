---
'@pikku/cli': patch
---

Remove the standalone `pikku console` command — `pikku dev` already serves the console at `/console`, and `pikku serve` now does too when passed the explicit `--console` flag.
