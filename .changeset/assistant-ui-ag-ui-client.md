---
"@pikku/assistant-ui": patch
---

Replace hand-rolled SSE parser with AG-UI client runtime

`usePikkuAgentRuntime` now uses `PikkuAgent extends HttpAgent` from `@ag-ui/client` and `useAgUiRuntime` from `@assistant-ui/react-ag-ui`, removing ~200 lines of custom SSE parsing. The non-streaming runtime (`usePikkuAgentNonStreamingRuntime`) has been removed; all agent chat is now streaming-only.

The approval/resume flow is preserved: `agent.queueResume()` routes the next `runAgent()` call to the `/resume` endpoint instead of `/stream`.

Root `resolutions` pin `@assistant-ui/core`, `assistant-stream`, `@assistant-ui/tap`, and `zustand` to exact versions. `@assistant-ui/react` and `@assistant-ui/react-ag-ui` must resolve to a *single* shared instance of each — the runtime context and zustand stores are singletons, so a duplicated copy would make the react-ag-ui runtime invisible to the react primitives. The pins force yarn to dedupe.
