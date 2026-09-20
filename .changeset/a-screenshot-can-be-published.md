---
'@pikku/core': patch
'@pikku/playwright': patch
---

`browser.screenshot('the order, confirmed', { showcase: true })` marks one shot as fit to publish outside the run, and the artifact ledger carries the flag. A gallery, a docs page or a marketing card can then be built from the scenario run itself instead of a second browser pass configured somewhere else, and the author of the step — the only one who knows the page is at a moment worth showing a stranger — is who decides.

Each filed screenshot also carries an `id`: the same shot under one key across runs. `path` leads with the order the run happened in, so inserting a step ahead of a shot renumbers it and anything meant to outlive one run (a caption override, a diff against last week's build) loses track of it.

Two supporting fixes in `@pikku/playwright`: contexts open at a pinned `viewport` (1440x900, overridable per config or via `E2E_VIEWPORT_WIDTH`/`E2E_VIEWPORT_HEIGHT`) and screenshots are taken with animations disabled, so two runs of the same scenario photograph the same thing. `{ fullPage: true }` is available for shots of a whole scrollable page.
