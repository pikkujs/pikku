---
'@pikku/cli': patch
---

`fabric validate` now type-checks every deployable frontend, the same compile the
build container runs before it will deploy, so a type error fails locally in
seconds instead of minutes into a deploy. Pass `--skip-typecheck` for the
structural checks alone.

Also fixes `fabric link` / `fabric init` clobbering `pikkufabric.config.json`:
they wrote a fresh `{ projectId }` object, silently deleting `frontends`,
`production` and `apiUrl`. Losing `frontends` means the build container deploys
no frontend at all, long after the link that caused it. The config is now merged.
