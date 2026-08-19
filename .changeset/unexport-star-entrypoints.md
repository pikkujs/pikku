---
'@pikku/azure-functions': patch
'@pikku/aws-services': patch
'@pikku/tanstack-start': patch
'@pikku/uws-handler': patch
'@pikku/cloudflare': patch
'@pikku/inspector': patch
'@pikku/fastify': patch
'@pikku/browser': patch
'@pikku/express': patch
'@pikku/lambda': patch
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/uws': patch
'@pikku/ws': patch
---

Stop re-exporting package internals through entry points

66 names reached consumers only because an `export *` in an entry point swept
them up. Each one is referenced solely inside its own package, so the star is
now an explicit named re-export listing what is genuinely public. The
declarations themselves are untouched — this narrows the entry point, not the
module.
