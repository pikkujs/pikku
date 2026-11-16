---
'@pikku/addon-admin': patch
---

Tag every function of the admin addon with one `admin:<domain>` tag (users, scopes, flags, git, themes, …) so the code city splits the addon into one building per domain. The tags are in the addon's function metadata and have no effect at runtime.
