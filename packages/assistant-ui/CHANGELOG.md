# @pikku/assistant-ui

## 0.12.4

### Patch Changes

- 424c777: `PikkuAgentChat` now accepts a `toolComponents` prop — a map of
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

## 0.12.3

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks

  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

## 0.12.2

### Patch Changes

- cc4a8e0: Show friendly error messages in agent chat instead of silently failing with a loading spinner

## 0.12.1

### Patch Changes

- 387b2ee: Rework agent chat UI with approval flows, tool call error badges, hideToolCalls option, and non-streaming runtime support
