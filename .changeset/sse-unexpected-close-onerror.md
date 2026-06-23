---
"@pikku/fetch": patch
---

`subscribeToSSE`: call `onError` when the stream closes cleanly without the caller having called `close()`. Previously a server-side connection drop (or any clean EOF before the terminal event) exited the read loop silently, leaving the caller's `runPhase` stuck at `'running'` indefinitely with no way to recover.
