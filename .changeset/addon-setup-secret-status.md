---
'@pikku/console': patch
---

Refresh an addon requirement's secret status after setting it from the Setup
tab. The card asked whether the secret existed under its own query key, which
nothing ever invalidated, so a secret you had just saved went on reading "Not
set" until the page was reloaded. It now shares the one `secret-value` query
that `useSetSecret` already invalidates.

The requirement cards, their connect/set actions and the instance selector also
carry test ids and their status as data attributes, so a test can assert that a
requirement is satisfied without reading the console's translated copy back to
it.
