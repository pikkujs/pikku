---
"@pikku/kysely": patch
---

fix: improve MySQL compatibility in AI storage service by using varchar columns with explicit lengths instead of text for primary keys, foreign keys, and indexed columns, and handle duplicate index errors gracefully
