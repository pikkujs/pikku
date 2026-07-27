---
'@pikku/console': patch
---

Make the users directory addressable from a test without putting PII in the DOM: `TableListPage` accepts a `getRowProps` callback, and the users table uses it to tag each row with its user id. The status badge, the per-user actions menu, its items, the confirmation button and the set-password field carry test ids, so a caller reads ban state from `data-banned` rather than from the translated badge copy.
