---
'@pikku/inspector': patch
---

A scenario that belongs to no feature is now reported.

Features are what the guide is written against: prose cites a feature, and the compiler fills that citation with the evidence from the scenarios the feature owns. A scenario nobody listed is therefore invisible — it runs, it captures screenshots and recordings, and none of it ever reaches a page. That failure is silent today, and it is the single reason two real projects have hundreds of captures bound to nothing.

The inspector now walks every feature's scenario list, and any scenario not claimed by one is reported as `PKU682`. It is an error rather than a critical, so `pikku all` keeps passing by default and the list is there to work through; `--fail-on-error` makes it a wall once a project has caught up.

Where a feature's scenario list cannot be read statically — a spread, a computed array — the check has nothing to compare against. It now says so, naming the features it could not read, instead of returning quietly and reporting zero.
