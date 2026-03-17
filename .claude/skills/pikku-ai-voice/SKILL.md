---
name: pikku-ai-voice
description: 'Use when adding voice input (speech-to-text) or voice output (text-to-speech) to AI agents in a Pikku app. Covers voiceInput/voiceOutput middleware hooks and STT/TTS service interfaces.
TRIGGER when: code uses voiceInput, voiceOutput, STTService, TTSService, or user asks about voice, speech-to-text, text-to-speech, or @pikku/ai-voice.
DO NOT TRIGGER when: user asks about AI agent wiring (use pikku-ai-agent) or Vercel AI SDK (use pikku-ai-vercel).'
---

# Pikku AI Voice (Speech I/O)

`@pikku/ai-voice` provides speech-to-text and text-to-speech middleware hooks for Pikku AI agents.

## Installation

```bash
yarn add @pikku/ai-voice
```

## API Reference

### Service Interfaces

```typescript
interface STTService {
  transcribe(audio: Uint8Array, options?: { language?: string; format?: string }): Promise<string>
}

interface TTSService {
  synthesize(text: string, options?: { voice?: string; format?: string }): Promise<Uint8Array>
  synthesizeStream?(text: string, options?: { voice?: string; format?: string }): AsyncIterable<Uint8Array>
}
```

### Middleware Hooks

```typescript
import { voiceInput, voiceOutput } from '@pikku/ai-voice'

voiceInput(config?: { language?: string }): PikkuAIMiddlewareHooks
voiceOutput(config?: { format?: string; voice?: string }): PikkuAIMiddlewareHooks
```

These return middleware hooks that can be attached to AI agent wirings to automatically transcribe audio input and synthesize audio output.

## Usage Patterns

### Voice-Enabled Agent

```typescript
import { voiceInput, voiceOutput } from '@pikku/ai-voice'
import { wireAIAgent } from '@pikku/core/ai-agent'

wireAIAgent({
  name: 'voice-assistant',
  model: 'openai:gpt-4o',
  systemPrompt: 'You are a voice assistant.',
  middlewareHooks: [
    voiceInput({ language: 'en' }),
    voiceOutput({ voice: 'alloy', format: 'mp3' }),
  ],
  func: myAgentFunc,
})
```

### Custom STT/TTS Services

Implement the `STTService` and `TTSService` interfaces with your provider (OpenAI Whisper, ElevenLabs, etc.) and register them as singleton services.
