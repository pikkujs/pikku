---
'@pikku/addon-console': patch
'@pikku/console': patch
---

feat(console): an addon install says what it still needs before a restart

`wireAddon` only reaches the live registry when its module is executed at boot,
so an addon installed into a running dev server is inert until a restart — while
`installAddon` returned a bare `success: true` and the Addons tab kept showing
the old list. The install now returns `restartRequired`, and whether the addon
could actually start: `ready`, `missingSecrets` and `missingVariables`, read from
the package's own declared secrets and variables under this instance's override
names. A variable whose schema carries a default is never missing.

`addonReadiness` re-runs that check for an already-installed instance, reading
the override names out of its `<namespace>.addon.ts`, so a caller can gate the
restart until the user has configured what the addon needs rather than
restarting into a crash loop.

The console renders that outcome instead of polling for the addon to become
queryable. Installing used to navigate to the package page, which polled
`getAddonInstalledPackage` for ~20s and then gave up with "Package not found" —
re-inspecting the new wiring routinely takes longer, so a successful install
looked like a failure. The page now shows what the install reported: the name it
was wired under, that a restart is required, and either that it is ready or which
secrets and variables are still unset.

`readAddonDeclaredNames` also now finds meta in a package that ships `.pikku`
only under `dist`, where it previously read as "declares nothing" and silently
skipped the per-instance override derivation.
