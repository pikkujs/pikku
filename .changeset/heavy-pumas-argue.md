---
'@pikku/cli': patch
---

fabric validate: honour better-auth `modelName` overrides in the auth schema check.

The check looked for migrations creating `user`, `session`, `account` and
`verification` — better-auth's default table names. An app that already owns a
`user` table renames the models (`user: { modelName: 'authUser' }`), and the
adapter's CamelCasePlugin then writes them as `auth_user`, `auth_session` and
so on. None of the default names appear in such an app's migrations, so a fully
migrated project was reported as having no better-auth schema at all — an error
it had no way to clear.

Each model now also matches its configured `modelName` and that name's
snake_case form, read from the source files that configure better-auth.
