---
'@pikku/cli': patch
---

The `migration-gap` check now tolerates duplicate numeric prefixes in migration filenames (applied migrations cannot be renamed) and only fails when an ID has no file at all. The reported range is now ascending (`23..24`) instead of a bogus `22..20`.
