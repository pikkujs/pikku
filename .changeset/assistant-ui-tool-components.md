---
'@pikku/assistant-ui': patch
---

`PikkuAgentChat` now accepts a `toolComponents` prop — a map of
`toolName` → React component — for per-tool custom rendering inside
the assistant bubble. Unmatched tool calls continue to fall through to
the default expandable tool-call display.

This unlocks generative-UI patterns: register a `renderWidget` tool on
the agent, return structured props from it, and mount real UI (charts,
diffs, cards) inline in the chat from the persisted tool-call args.
Because the rendered widget is just a tool call under the hood, it
survives refresh, streams correctly, and stays part of the thread's
history.

```tsx
<PikkuAgentChat
  agentName="myAgent"
  threadId={threadId}
  resourceId={userId}
  api="/rpc/agent"
  toolComponents={{
    renderWidget: ({ args }) => <WidgetRegistry spec={args} />,
  }}
/>
```
