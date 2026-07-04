---
'@pikku/core': patch
'@pikku/console': patch
---

Run user flows from the console, actors and all (#850)

Starting a `user-flow` workflow without explicit run actors (as the console's
Run button does) now auto-builds HTTP actors from `USER_FLOW_ACTOR_SECRET` and
`API_URL`: each actor signs in via the actor auth plugin — which mints the
`actor: true` user row on first sign-in — and drives its steps over HTTP as
that persona. When the secret or API base URL isn't configured the run simply
proceeds without actors (with a warning) instead of failing.

The workflow-detail view also gains the shared console header: the workflow
selector and the "complex workflow" note now live in the header bar, the right
details panel hides when it has nothing to show, and step nodes display their
DSL labels (e.g. `Double ${item}`).
