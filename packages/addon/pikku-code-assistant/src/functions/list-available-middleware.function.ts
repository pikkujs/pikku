import { pikkuSessionlessFunc } from '#pikku'

const KNOWN_AI_MIDDLEWARE = [
  {
    name: 'voiceInput',
    description: 'Transcribes audio input to text',
    requiresService: 'stt',
  },
  {
    name: 'voiceOutput',
    description: 'Synthesizes text responses to audio',
    requiresService: 'tts',
  },
]

export const listAvailableMiddleware = pikkuSessionlessFunc<
  null,
  {
    aiMiddleware: {
      name: string
      description: string
      requiresService: string
    }[]
  }
>({
  expose: true,
  description: 'Lists known AI middleware options for agent configuration',
  func: async () => {
    return { aiMiddleware: KNOWN_AI_MIDDLEWARE }
  },
})
