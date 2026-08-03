---
'@pikku/cli': patch
---

Unbreak the CLI bootstrap, which had been failing every build on main.

The bootstrap runs a published CLI over this package's own sources, and those
sources track local core. Three core modules had drifted ahead of every
published version — `services/local-content` (`signedContentPath`),
`crypto-utils` (`deriveKEK`) and the `errors/errors` the latter imports
(`WeakKeyMaterialError`) — so the load died on the first missing export before
codegen began.

The pin could not simply move forward. It is ahead of the repo as well as behind
it: the bootstrap CLI imports `createHttpScenarioActors` from
`@pikku/core/services`, a name local core has since dropped, so pointing the
whole package at local core trades one broken build for another. Only the three
drifted modules are overlaid, which leaves everything the pinned CLI reaches for
as published. All three are safe to lift out on their own — between them they
import nothing from core beyond `error-handler`, which has not moved.
