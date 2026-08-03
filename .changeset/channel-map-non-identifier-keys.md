---
'@pikku/cli': patch
'@pikku/core': patch
---

Make a CLI served over a channel typecheck in a real project.

Both of these are unreachable for a hand-written `wireChannel`, whose routes are usually
bare identifiers, and unavoidable for a CLI one, whose routes are command ids.

`ChannelsMap` emitted route and message keys unquoted. A command id is a kebab or dotted
name far more often than not — `app-smoke`, `registry.search`, `package.upgrade-pikku` —
and each one ends the property early, so the generated map is not parseable TypeScript at
all. One project's map came out with 107 syntax errors from a single CLI channel. Keys are
now quoted when they are not bare identifiers, and left alone when they are, so existing
generated output is unchanged.

`executeRawCLIViaChannel` typed its renderers `Record<string, CorePikkuCLIRender<any>>`,
whose services parameter defaults to `CoreServices`. The renderers a generated client
passes are the app's own, typed against its `SingletonServices`, and a function taking
those is not assignable to one taking `CoreServices` — so the generated client failed to
compile for any app that adds a service, which is every app. Widened to `<any, any>`;
nothing is lost, because a client-side renderer is never handed services at all, which is
why generation already rejects one that reads them.
