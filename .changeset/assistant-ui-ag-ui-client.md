---
"@pikku/assistant-ui": major
---

Replace hand-rolled SSE parser with AG-UI client runtime

`usePikkuAgentRuntime` now uses `PikkuAgent extends HttpAgent` from `@ag-ui/client` and `useAgUiRuntime` from `@assistant-ui/react-ag-ui`, removing ~200 lines of custom SSE parsing. The non-streaming runtime (`usePikkuAgentNonStreamingRuntime`) has been removed; all agent chat is now streaming-only.

The approval/resume flow is preserved: `agent.queueResume()` routes the next `runAgent()` call to the `/resume` endpoint instead of `/stream`.
