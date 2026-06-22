---
'@pikku/core': patch
---

LocalMetaService.getEmailMeta no longer caches — it reads the generated
pikku-emails-meta.gen.json fresh on each call (a local JSON read is cheap),
so newly-generated email templates surface without restarting the process.
