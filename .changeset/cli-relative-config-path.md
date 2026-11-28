---
'@pikku/cli': patch
---

A relative config path (`-c ../../pikku.config.json`) is made absolute before it is read, so every pass `pikku all` starts in another directory reads the same file. Run from a main package, a relative path used to resolve against the package pass's own directory and write `.pikku` output above the project.
