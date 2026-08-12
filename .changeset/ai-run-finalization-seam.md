---
'@pikku/core': patch
'@pikku/ai-vercel': patch
---

Give a finished agent run one finalization seam, and make a failed tool call
distinguishable from a tool that returned text saying "Error:".

- Tool results carry `error` as its own field, from the runner through the
  stream event and the run's step record into persisted messages.
- `modifyOutput` receives the run's tool calls and may return a rewritten list,
  which is redistributed back onto the steps it came from.
- Streamed runs accumulate their tool calls across steps, and every completion
  path — streamed, non-streamed, and resumed after a tool approval — now
  finalizes through `finalizeAgentRun`. A tool that fails after being approved
  leaves a record on the run instead of vanishing.
