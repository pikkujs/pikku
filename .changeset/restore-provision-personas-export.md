---
'@pikku/better-auth': patch
---

Export `provisionPersonas` again.

Moving provisioning into the fabric plugin was right for a deployed stage, but un-exporting the function left an app that boots its own server through `pikku serve` — where `afterStart` genuinely runs — with no way to provision at all.

The plugin remains the arrangement to reach for: it is the only one that works on Workers or a serverless target. `provisionPersonas` is for the server case, and its documentation now says which is which.
