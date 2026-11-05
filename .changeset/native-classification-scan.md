---
'@pikku/inspector-go': patch
---

Port the classification scan to the native inspector. `pikku all --security` on
the default engine silently skipped PKU910, PKU953 and PKU954, so a secret or
personal data reaching a log or a sessionless return type went unreported. The
checks now run in Go with the same messages as `@pikku/inspector`.
