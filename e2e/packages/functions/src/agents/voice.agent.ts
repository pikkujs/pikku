import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { voiceInput } from '@pikku/core/agent'

export const voiceInputAgent = pikkuAgent({
  name: 'voice-input-agent',
  description: 'Transcribes spoken audio attachments before answering',
  goal: 'You answer questions the user speaks aloud.',
  model: 'chat',
  agentMiddleware: [
    voiceInput({
      model: 'deepinfra/nvidia/Nemotron-3.5-ASR-Streaming-Multilingual-0.6b',
    }),
  ],
  maxSteps: 3,
  toolChoice: 'auto',
})

export const voiceInputNoModelAgent = pikkuAgent({
  name: 'voice-input-no-model-agent',
  description: 'Configures voice input without a transcription model',
  goal: 'You answer questions the user speaks aloud.',
  model: 'chat',
  agentMiddleware: [voiceInput({})],
  maxSteps: 3,
  toolChoice: 'auto',
})
