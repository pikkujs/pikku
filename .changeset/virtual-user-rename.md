---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/knowledge': patch
'@pikku/skills': patch
'@pikku/playwright': patch
'@pikku/kysely': patch
'@pikku/better-auth': patch
'@pikku/react': patch
'@pikku/addon-console': patch
---

Virtual users now have one name everywhere. The id column of `virtual_user_run` and `virtual_user_schedule` is `virtual_user_id` (a migration renames it in place), the CLI group is `pikku virtual-user …`, and the declarations and imports live under `@pikku/core/virtual-user`. The previous names are removed with no aliases.

The default virtual user email domain is now `virtualuser.invalid`: apps that rely on the default domain get new accounts at the next provisioning (`pikku virtual-user sync`, deploy, or `pikku dev` start), and the old rows stay unused.

The sign-in surface carries the same name. The route is `/sign-in/virtual-user`, the environment variables are `PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN`, `SCENARIO_VIRTUAL_USER_SECRET` and the `PIKKU_DEV_VIRTUAL_USER_SIGN_IN` / `VITE_*` equivalents, the Better Auth plugin is `pikkuVirtualUser`, the scenario step option and wire member are `virtualUser` and `virtualUsers`, and the Better Auth user flag column is `virtual_user`. Rename the environment variables wherever you set them, and add a migration that renames the flag column on the `user` table. Nothing is aliased.

The conversation runner is now `@pikku/core/virtual-user/conversation`, replacing the old `-flow` subpath. Update the import; the old subpath is gone.
