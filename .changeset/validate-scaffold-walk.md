---
'@pikku/cli': patch
---

`pikku validate` no longer runs out of memory looking for scaffold output outside the scaffold directory. The check lists a project's source files without entering `node_modules` or dot directories and without following symlinks, so the symlink cycles between workspace packages cannot be walked.
