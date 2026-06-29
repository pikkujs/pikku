# Subscribing to other SSE / WebSocket routes

The same `PikkuRealtime` client also handles generic SSE + channel routes (not just
`/events` topics). Use the path; the base URL is inherited from `PikkuFetch`.

```ts
// Any `sse: true` HTTP route
const sub = realtime.subscribeToSSE<{ progress: number }>(
  `/workflow-run/${runId}/stream`,
  (event) => setProgress(event.progress)
)
// later: sub.close()

// Any wireChannel — open a raw socket, wrap in PikkuWebSocket for typed I/O
const ws = realtime.connectToChannel('/ws/kanban')
const typed = new PikkuWebSocket<'kanban-live'>(ws)
typed.getRoute('command').subscribe('message', (data) => {
  /* ... */
})
```

Discover what's available with `pikku meta clients --json` — `channels` and any HTTP
`sse: true` routes are listed there.
