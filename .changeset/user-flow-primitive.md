---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/console': patch
---

pikkuUserFlow: user flows as workflows. A complex workflow whose steps can run
as actors over the real transport — `workflow.do(step, rpc, data, { actor:
actors.yasser })` — plus `workflow.expectEventually(...)` for polling async
effects. Actor steps never queue and never dispatch internally, so auth
middleware/permissions are exercised end-to-end; flows double as e2e tests and
staged/production health checks. Ships UserFlowActor types +
createHttpUserFlowActors (lazy sign-in via `/auth/sign-in/actor` with a
server-held secret), inspector source `'user-flow'`, and a console badge.
