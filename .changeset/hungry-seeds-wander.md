---
'@pikku/cli': patch
---

Set a busy timeout on the sqlite scenario baseline connection. The app under
test keeps its own connection to the file, and a rollback-journal database gives
a writer an exclusive lock, so a restore that overlapped one of the app's reads
failed the scenario outright with `database is locked`.
