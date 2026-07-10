---
'@pikku/inspector': patch
---

Remove 16 dormant `ErrorCode` enum entries that were defined but never emitted anywhere in the framework. These were placeholder registrations that were never wired to a diagnostic, or codes whose emission sites were removed in later refactors (e.g. `PKU901`, `PKU431`). A whole-repo audit found zero emission sites — no user could ever see them — so they only cluttered the registry and demanded docs pages for errors that cannot occur.

Removed: `PKU300`, `PKU426`, `PKU427`, `PKU431`, `PKU488`, `PKU529`, `PKU568`, `PKU685`, `PKU715`, `PKU736`, `PKU787`, `PKU835`, `PKU836`, `PKU901`, `PKU937`, `PKU975`.

A new guard test (`error-codes-emitted.test.ts`) fails if any `ErrorCode` value has no `ErrorCode.<NAME>` or raw `PKU###` reference in the source, so dead entries can't silently accumulate again.
