# @pikku/ai-vercel

Vercel AI SDK agent runner for Pikku. Backs `pikkuAIAgent` with any provider the
`ai` package supports.

## Install

```bash
npm install @pikku/ai-vercel ai
```

## Usage

```typescript
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import { openai } from '@ai-sdk/openai'

const aiAgentRunner = new VercelAIAgentRunner({ openai })
```

Pass a `providerFactory` as the second argument to build providers from a
per-request API key, and `allowedAttachmentHosts` as the third to restrict where
attachments may be downloaded from.

## Docs

https://pikku.dev/docs
