---
'@pikku/cli': patch
---

fix(cli): validate flags a dead Design tab instead of mentioning it

A project that renders Mantine but has no `packages/mantine-theme/` (or no
`themes/<id>.json`) gets a Design tab that renders "No themes yet". That was
reported at info, under a summary ending "no errors". It is now a warning when
an app depends on `@mantine/core` or `@pikku/mantine`, and stays info otherwise.

The `components-missing` check is replaced by `design-no-stories`, which looks
where the design server actually globs stories — `apps/*/src/components/**/*.stories.tsx`
— rather than at `packages/components/`.
