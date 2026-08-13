---
'@pikku/core': patch
---

fix(core): persist working memory on streamed agent runs

Working memory was never persisted when an agent streamed. The working memory
middleware strips the `<working_memory>` block from the outgoing deltas, and the
channel that accumulates the reply sits downstream of that strip — so the text
later handed to `modifyOutput`, the only place that calls `saveWorkingMemory`,
had already had the block removed. It now persists from the stream hook, at the
step's `usage` (or `done`) event, where the raw text is still reachable.

With that dependency gone, `modifyOutput` no longer runs at all on a streamed
run: nothing on that path could act on what it returned, since the text has
already reached the client and each step is flushed to storage as it goes. A
middleware that rewrites in `modifyOutput` without a `modifyOutputStream` — a
redaction hook, typically — was silently ineffective while streaming, and is now
warned about once per agent.
