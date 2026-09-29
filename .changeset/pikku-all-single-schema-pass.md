---
'@pikku/inspector': patch
'@pikku/cli': patch
---

`pikku all` now generates TypeScript schemas once, at the end of the run, instead of on every re-inspection. It also repeats the codegen passes until the generated files stop changing, so a single run is complete and a second run changes nothing. On the e2e project a cold run takes 18s, down from 38s plus a second 24s run to converge. Peak heap drops from 1.28GB to 0.93GB.
