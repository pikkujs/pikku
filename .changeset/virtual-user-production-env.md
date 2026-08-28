---
'@pikku/core': patch
'@pikku/cli': patch
---

Decide whether a virtual-user run is against production from the configured
environment rather than `NODE_ENV`.

A deployment whose staging is a production mirror runs `NODE_ENV=production`
there too, so the old check refused every disposition on the one environment
they exist to be used on. `startVirtualUserRun` now takes the `environments`
generated beside the personas and the environment this process is (`PIKKU_ENV`
by default), which is the same signal `personaEnvironmentRefusal` already
checks at sign-in; the generated scaffold passes them. An environment that
cannot be resolved is treated as production. `NODE_ENV` remains the answer for
a project that configures no environments at all.
