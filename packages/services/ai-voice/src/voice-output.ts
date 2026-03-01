import type { PikkuAIMiddlewareHooks } from '@pikku/core/ai-agent'
import type { TTSService } from './types.js'

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

export const voiceOutput = (config?: {
  format?: string
  voice?: string
}): PikkuAIMiddlewareHooks => ({
  modifyOutputStream: async (services, { event, state }) => {
    if (event.type !== 'text-delta') return event

    const tts = (services as { tts?: TTSService }).tts
    if (!tts) return event

    state.textBuffer = ((state.textBuffer as string) || '') + event.text
    if (!isSentenceBoundary(state.textBuffer as string)) return event

    const text = state.textBuffer as string
    state.textBuffer = ''

    const audio = await tts.synthesize(text, {
      voice: config?.voice,
      format: config?.format,
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
