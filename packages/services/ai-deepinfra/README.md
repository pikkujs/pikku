# @pikku/ai-deepinfra

DeepInfra transcription and speech models for the Vercel AI SDK.

`@ai-sdk/deepinfra` covers DeepInfra's language, embedding and image models. It
does not cover audio, and `@ai-sdk/openai-compatible` cannot be pointed at
DeepInfra's audio endpoints either: they are not OpenAI-shaped. Everything at
DeepInfra — chat, ASR, TTS alike — is `POST /v1/inference/{model}`, and ASR takes
its upload under a part named `audio` rather than OpenAI's `file`. This package
is that gap, and nothing else.

## Install

```bash
npm install @pikku/ai-deepinfra
```

## Usage

```typescript
import { createDeepInfra } from '@pikku/ai-deepinfra'
import { VercelAIAgentRunner } from '@pikku/ai-vercel'

const aiAgentRunner = new VercelAIAgentRunner({
  deepinfra: createDeepInfra(), // reads DEEPINFRA_API_KEY
})
```

Then name models the way the runner parses them — provider, slash, model id:

```typescript
voiceInput({ model: 'deepinfra/openai/whisper-large-v3-turbo' })
voiceOutput({ model: 'deepinfra/hexgrad/Kokoro-82M' })
```

The runner splits on the *first* slash only, so the rest reaches DeepInfra
intact. The `openai/` in that id is the org that published the weights on
HuggingFace, not the vendor serving them — this is Whisper running on DeepInfra,
with no OpenAI account involved.

For language models, keep `@ai-sdk/deepinfra` alongside this one; the two are
independent.

## Options

```typescript
createDeepInfra({
  apiKey,   // defaults to process.env.DEEPINFRA_API_KEY
  baseURL,  // defaults to https://api.deepinfra.com/v1/inference
  headers,  // merged into every request
  fetch,    // injectable, so tests need neither a key nor a network
})
```

The key is read per request rather than at construction, so a provider can be
built before the environment is loaded — the error lands on the call that
needed it.

Per-model knobs ride through `providerOptions`:

```typescript
await transcribe({
  model: deepinfra.transcription('openai/whisper-large-v3-turbo'),
  audio,
  providerOptions: { deepinfra: { chunk_level: 'word' } },
})
```

## Models

Anything DeepInfra serves; the model id is opaque to this package. Current
audio options include:

| Model                                    | Kind | Price                    |
| ---------------------------------------- | ---- | ------------------------ |
| `openai/whisper-large-v3-turbo`          | ASR  | $0.00020/min             |
| `openai/whisper-large-v3`                | ASR  | $0.00045/min             |
| `Qwen/Qwen3-ASR-0.6B`                    | ASR  | $0.00020/min             |
| `Voxtral-Mini-3B`                        | ASR  | $0.00100/min             |
| `hexgrad/Kokoro-82M`                     | TTS  | $0.80/M chars            |

DeepInfra serves streaming-capable ASR models in batch mode only, so their
streaming modes are not reachable through this API.

## Docs

https://pikku.dev/docs
