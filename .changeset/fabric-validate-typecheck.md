---
'@pikku/cli': patch
---

`fabric validate` now type-checks every deployable frontend, the same compile the
build container runs before it will deploy, so a type error fails locally in
seconds instead of minutes into a deploy. Pass `--skip-typecheck` for the
structural checks alone.

Declared frontends are shape-checked before they are used, so a malformed
`frontends` entry is reported as a finding instead of throwing part-way through
validation, and a deployable frontend whose directory does not exist is an error
even in a project with no `apps/` directory.

Also fixes `fabric link` / `fabric init` clobbering `pikkufabric.config.json`:
they wrote a fresh `{ projectId }` object, silently deleting `frontends`,
`production` and `apiUrl`. Losing `frontends` means the build container deploys
no frontend at all, long after the link that caused it. The config is now merged,
and a config that cannot be read at all is left alone rather than overwritten.
