---
'@pikku/console': patch
---

`EmptyStatePlaceholder` carries `data-testid="empty-state"`, so a browser scenario can assert a console page rendered its empty state rather than matching on untranslated copy.
