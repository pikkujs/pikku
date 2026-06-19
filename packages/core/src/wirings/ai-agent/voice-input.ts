import type { AIAgentRunnerService } from '../../services/ai-agent-runner-service.js'
import { pikkuAIMiddleware } from '../../types/core.types.js'
import type { AIContentPart } from './ai-agent.types.js'

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const MAX_AUDIO_SIZE = 50 * 1024 * 1024

async function fetchAsUint8Array(url: string): Promise<Uint8Array> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP(S) URLs are supported for audio')
  }
  const response = await fetch(url)
  const contentLength = response.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_SIZE) {
    throw new Error('Audio file exceeds maximum size')
  }
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_AUDIO_SIZE) {
    throw new Error('Audio file exceeds maximum size')
  }
  return new Uint8Array(buffer)
}

export const voiceInput = (config?: { language?: string; model?: string }) =>
  pikkuAIMiddleware({
    modifyInput: async (services, { messages, instructions }) => {
      const transcribeAudio = (services as {
        aiAgentRunner?: AIAgentRunnerService
      }).aiAgentRunner?.transcribe
      if (!transcribeAudio) return { messages, instructions }

      const last = messages[messages.length - 1]
      if (!last || last.role !== 'user' || typeof last.content === 'string') {
        return { messages, instructions }
      }

      const parts = last.content as AIContentPart[]
      if (!parts) return { messages, instructions }

      const audioParts = parts.filter(
        (p): p is Extract<AIContentPart, { type: 'file' }> =>
          p.type === 'file' && !!p.mediaType?.startsWith('audio/')
      )
      if (audioParts.length === 0) return { messages, instructions }

      const textParts = parts.filter((p) => p.type === 'text')
      const otherParts = parts.filter(
        (p) =>
          p.type !== 'text' &&
          !(p.type === 'file' && p.mediaType?.startsWith('audio/'))
      )

      const transcriptions = await Promise.all(
        audioParts.map(async (p) => {
          const audioData = p.data
            ? base64ToUint8Array(p.data)
            : await fetchAsUint8Array(p.url!)
          if (!config?.model) {
            throw new Error(
              'voiceInput requires a transcription model (e.g. openai/whisper-1)'
            )
          }
          const result = await transcribeAudio({
            model: config.model,
            audio: audioData,
            ...(config.language
              ? {
                  providerOptions: {
                    openai: {
                      language: config.language,
                    },
                  },
                }
              : {}),
          })
          return result.text
        })
      )

      const updatedContent: AIContentPart[] = [
        ...textParts,
        ...otherParts,
        ...transcriptions.map((text) => ({ type: 'text' as const, text })),
      ]

      return {
        messages: [
          ...messages.slice(0, -1),
          { ...last, content: updatedContent },
        ],
        instructions,
      }
    },
  })
