---
'@pikku/cli': patch
---

`pikku fabric report` sends findings through fabric's `submitFinding` RPC instead of the `/findings` route that never existed, so held findings finally leave the machine.
