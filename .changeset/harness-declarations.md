---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Experimental harness declarations: `pikkuHarness`, `pikkuHarnessGate` and `pikkuHarnessGateAgent` in `@pikku/core/harness`. Both inspector engines read them; `pikku all` writes `.pikku/harness/pikku-harness-meta.gen.json` and the `HarnessGateName` union, and refuses a harness that lists an undeclared gate (PKU157). Gates carry `harness: true`, `failOn` and `writes` in their function meta and are left out of the app's registrations, schema register and every deployment unit. Nothing runs a harness yet.
