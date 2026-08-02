import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { voiceInput } from '@pikku/core/ai-agent'

export const voiceInputAgent = pikkuAIAgent({
  name: 'voice-input-agent',
  description: 'Transcribes spoken audio attachments before answering',
  goal: 'You answer questions the user speaks aloud.',
  model: 'openai/gpt-5-mini',
  aiMiddleware: [
    voiceInput({
      model: 'deepinfra/nvidia/Nemotron-3.5-ASR-Streaming-Multilingual-0.6b',
    }),
  ],
  maxSteps: 3,
  toolChoice: 'auto',
})

export const voiceInputNoModelAgent = pikkuAIAgent({
  name: 'voice-input-no-model-agent',
  description: 'Configures voice input without a transcription model',
  goal: 'You answer questions the user speaks aloud.',
  model: 'openai/gpt-5-mini',
  aiMiddleware: [voiceInput({})],
  maxSteps: 3,
  toolChoice: 'auto',
})
