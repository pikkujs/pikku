# @pikku/assistant-ui

[assistant-ui](https://assistant-ui.com) bindings for Pikku AI agents — a
runtime hook, human-in-the-loop approvals, and conversion from stored messages
to assistant-ui's format.

## Install

```bash
npm install @pikku/assistant-ui
```

## Usage

```typescript
import { usePikkuAgentRuntime, PikkuApprovalContext } from '@pikku/assistant-ui'

const runtime = usePikkuAgentRuntime({ agent: 'support', pikku })
```

Wrap your thread in `PikkuApprovalContext` and read `usePikkuApproval()` to
render pending tool approvals.

## Docs

https://pikku.dev/docs
