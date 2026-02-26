---
"@pikku/lambda": patch
---

Update `@types/aws-lambda` peer and dev dependency to `^8.10.161` to resolve a `Duplicate identifier 'HttpResponseStream'` TypeScript error that appeared when bundling alongside other AWS SDK packages.
