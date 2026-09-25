---
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `pikku new app` and the registry's discovery half.

**`pikku new app <slug> --serves <group> --personas <ids>`** adds a frontend,
scaffolded from `pikkujs/starter-template`'s `apps/app`. It re-points the copy's
`package.json` at its own name, dev/preview port and `--tsBuildInfoFile`, stamps
`app: '<slug>'` onto each named persona, writes the `frontends` entry and
re-runs the install. `pikku-build`'s `multi-app.md` described all of that as
five files to edit by hand, including the build-cache path whose absence
produces type errors that vanish on a clean build.

It scaffolds from the template rather than copying the app already in the
project: a copy drags the first app's screens, routes and nav into an audience
that never asked for them. `--template <source>` takes any giget source, or a
path inside the repo for an offline or vendored copy.

The refusals matter more than the scaffolding, because the scaffolding is five
edits and a wrong audience is a whole second app nobody needed: a `--serves`
that names a surface rather than people, an audience that already has an app,
a persona who already signs into another one, a slug the plan already uses for
an existing app, and a persona no `definePersonas({…})` declares. It repairs
its own half-states too — the directory is written before the config entry,
and neither half survives alone.

It stops after the install; serving the app belongs to whatever hosts it.

**`pikku fabric addon search|get`** fill in the registry's read half, next to
the `verify`/`publish`/`add` that were already there. Both catalogues are
public GETs, so discovery needs no login — the question "is there already an
addon for this?" comes up before adopting one, not after. `search` prints
published addons ahead of OpenAPI entries, because one is built and typed
while the other still costs a codegen round that can fail on a bad spec.
`get` accepts every spelling in the wild — `gmail`, `addon-gmail` and
`@pikku/addon-gmail` all reach `pikku-addon-gmail`, including the ones
`search` itself printed.
