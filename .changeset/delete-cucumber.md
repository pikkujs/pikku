---
'@pikku/cucumber': patch
---

Delete @pikku/cucumber. The package now ships no code — only a README saying it
is gone.

Its sources had already been removed and nothing in the monorepo imports it;
what remained was a package whose README still advertised an `Actor` export that
no longer existed, which failed the README-import gate and blocked the release
from publishing. End-to-end tests are written with `pikkuScenario` /
`pikkuScenarioStep`; pin `0.12.16` if you are still migrating.
