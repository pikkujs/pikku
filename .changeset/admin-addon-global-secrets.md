---
'@pikku/cli': patch
'@pikku/addon-admin': patch
---

The generated `wireAddon` for `@pikku/addon-admin` now sets `globalSecrets` (and widens the `globalCredentials` reason), so `admin:secretHas`, `admin:secretGet`, `admin:secretSet` and the variable functions are no longer refused with `Access denied to secret key` for every caller. Apps that wire the admin addon by hand must add `globalSecrets: '<reason>'` too; see the addon README.
