---
'@pikku/cli': patch
---

validate: warn when a project declares no personas, wires no actor sign-in, or configures no environments

The checks live in one shared module and run from both `pikku workspace validate` and `pikku fabric validate`, so a project sees them whichever command it uses. Workspace validate now also runs the knowledge-base checks fabric validate already ran. Everything reported here is a warning — a project with no personas is under-tested, not broken.
