---
"@pikku/cli": patch
---

fix(cli): don't inspect during the cold bootstrap function-types pass

`pikkuFunctionTypes` began calling `getInspectorState()` to decide whether to
re-export the typed `pikkuBetterAuth` from the generated types hub. But it also runs
as the cold bootstrap step whose job is to *write* `.pikku/pikku-types.gen.ts`
before any inspection happens — and a full inspect runtime-imports user files
that themselves import that not-yet-written file, deadlocking on a cold `.pikku`
(`pikku bootstrap` returned rc=1 with the types file missing; schema generation
for a `wireSecret` schema failed with "Cannot find module
.pikku/pikku-types.gen.js"). The function-types step now takes a `{ bootstrap }`
flag (matching the other bootstrap type steps) so the cold pass skips inspector
state entirely; the auth re-export is added on the later post-inspect pass where
`.pikku` already exists.
