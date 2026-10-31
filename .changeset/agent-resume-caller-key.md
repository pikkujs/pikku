---
'@pikku/core': patch
---

Approving or resuming a suspended agent run now uses the caller's `AI_API_KEY` credential, the same as starting one. With no credential, or a runner without `withApiKey`, nothing changes.
