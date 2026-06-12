---
"@pikku/addon-console": minor
"@pikku/console": minor
"@pikku/fetch": minor
"@pikku/cli": patch
---

feat(console): Tests page with live SSE streaming and function test harness

- `@pikku/addon-console`: add `streamFunctionTests` SSE function that runs the
  cucumber/c8 test harness and streams structured per-scenario events
  (scenario-start, step, scenario-done, done)
- `@pikku/console`: TestsPage live run view — renders scenario names and step
  status in real time during a test run via SSE; adds `usePikkuSSE` hook and
  `showRunButton` prop
- `@pikku/fetch`: add `subscribePikkuSSE` helper for typed server-sent event
  streams
- `@pikku/cli`: wire SSE-returning functions through the console serialiser and
  RPC wrapper so the stream route is included in generated clients
