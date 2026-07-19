---
'@pikku/addon-console': patch
---

Installing an addon now returns typed errors instead of a raw 500. Re-installing
under a name that's already wired raises a `ConflictError` (409) with a clean,
path-free message ("An addon is already installed under the name ..."), and
invalid package/namespace/version inputs raise `BadRequestError` (400) — so the
console surfaces them inline as user-facing errors rather than a server stack
trace.
