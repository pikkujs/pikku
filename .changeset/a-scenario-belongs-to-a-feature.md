---
'@pikku/inspector': patch
---

A scenario that belongs to no feature is now reported.

Features are what the guide is written against: prose cites a feature, and the compiler fills that citation with the evidence from the scenarios the feature owns. A scenario nobody listed is therefore invisible — it runs, it captures screenshots and recordings, and none of it ever reaches a page. That failure is silent today, and it is the single reason two real projects have hundreds of captures bound to nothing.

The inspector now walks every feature's scenario list, and any scenario not claimed by one is reported as `PKU682`. It is an error rather than a critical, so `pikku all` keeps passing by default and the list is there to work through; `--fail-on-error` makes it a wall once a project has caught up.

Membership reads the scenario each entry names, not the entry itself. A `data` the AST cannot evaluate — `'a'.repeat(64)`, a call, anything computed — leaves the entry partial for the console but says nothing about who owns the scenario, and the check no longer treats the two as the same thing.

An entry that names no scenario at all — a spread, a `.map()` — does leave membership unknown. That only matters once something is already unowned, so the check reports it then, as a warn naming both the unowned scenarios and the features that could be hiding them, rather than accusing a scenario that may well be in one of those arrays.
