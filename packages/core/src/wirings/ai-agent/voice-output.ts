import type { AIAgentRunnerService } from '../../services/ai-agent-runner-service.js'
import { pikkuAIMiddleware } from '../../types/core.types.js'

type VoiceOutputState = {
  textBuffer?: string
}

function bufferToBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!)
  }
  return btoa(binary)
}

const SENTENCE_BOUNDARY = /[.!?]\s*$/

function isSentenceBoundary(text: string): boolean {
  return SENTENCE_BOUNDARY.test(text)
}

async function synthesizeAudio(
  aiAgentRunner: AIAgentRunnerService,
  input: {
    model: string
    text: string
    voice?: string
    format?: string
    instructions?: string
    speed?: number
    language?: string
  }
): Promise<Uint8Array> {
  const result = await aiAgentRunner.generateSpeech?.({
    model: input.model,
    text: input.text,
    voice: input.voice,
    outputFormat: input.format,
    instructions: input.instructions,
    speed: input.speed,
    language: input.language,
  })
  if (!result) {
    throw new Error(
      'voiceOutput requires an aiAgentRunner with generateSpeech support'
    )
  }
  return result.audio.uint8Array
}

export const voiceOutput = (config?: {
  model?: string
  format?: string
  voice?: string
  instructions?: string
  speed?: number
  language?: string
}) =>
  pikkuAIMiddleware<VoiceOutputState>({
    modifyOutputStream: async (services, { event, state }) => {
      const aiAgentRunner = (services as {
        aiAgentRunner?: AIAgentRunnerService
      }).aiAgentRunner
      if (!aiAgentRunner?.generateSpeech) return event

      if (event.type === 'done') {
        const remaining = state.textBuffer ?? ''
        if (remaining) {
          state.textBuffer = ''
          if (!config?.model) {
            throw new Error(
              'voiceOutput requires a speech model (e.g. openai/tts-1)'
            )
          }
          const audio = await synthesizeAudio(aiAgentRunner, {
            model: config.model,
            text: remaining,
            voice: config?.voice,
            format: config?.format,
            instructions: config?.instructions,
            speed: config?.speed,
            language: config?.language,
          })
          return [
            {
              type: 'audio-delta' as const,
              data: bufferToBase64(audio),
              format: config?.format ?? 'pcm16',
            },
            { type: 'audio-done' as const },
            event,
          ]
        }
        return [{ type: 'audio-done' as const }, event]
      }

      if (event.type !== 'text-delta') return event

      state.textBuffer = `${state.textBuffer ?? ''}${event.text}`
      if (!isSentenceBoundary(state.textBuffer)) return event

      const text = state.textBuffer
      state.textBuffer = ''

      if (!config?.model) {
        throw new Error(
          'voiceOutput requires a speech model (e.g. openai/tts-1)'
        )
      }
      const audio = await synthesizeAudio(aiAgentRunner, {
        model: config.model,
        text,
        voice: config?.voice,
        format: config?.format,
        instructions: config?.instructions,
        speed: config?.speed,
        language: config?.language,
      })

      return [
        event,
        {
          type: 'audio-delta' as const,
          data: bufferToBase64(audio),
          format: config?.format ?? 'pcm16',
        },
      ]
    },
  })
