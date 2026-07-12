---
"@pikku/ai-tanstack": patch
---

Throw on provider stream errors instead of returning `finishReason: 'error'`

The TanStack runner now throws when the underlying provider stream errors
(`RUN_ERROR`), so the core AI stream handler marks the run failed and fires
`onError` middleware — matching the vercel runner. Previously it returned a
step with `finishReason: 'error'`, which core treated as a normal completed
step (run left `completed`). This makes the two runners interchangeable on the
error path, not just the happy path; the full `@ai` e2e suite passes against
both (`PIKKU_AI_RUNNER=tanstack|vercel`).
