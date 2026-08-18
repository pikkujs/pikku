---
'@pikku/inspector': patch
---

Raise an addon's deploy conflict only where the consuming app wires it. A
function an addon publishes as `deploy: 'serverless'` while naming one of its
own services serverless-incompatible previously failed the build of any app
that merely declared the addon, whether or not that function was used.
