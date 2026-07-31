import type { AIAgentRunnerService } from '../../services/ai-agent-runner-service.js'
import { pikkuAIMiddleware } from '../../types/core.types.js'
import { safeFetch } from '../../utils/safe-fetch.js'
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

/**
 * Raised when every audio part in a turn turned out to be non-speech.
 *
 * Distinct from a transcription failure, because the response is different: a
 * failure is worth reporting, whereas this is the microphone doing its job on a
 * pause. A voice loop should catch it and go back to listening without running
 * the agent — answering a hallucinated sentence is worse than answering nothing.
 */
export class NoSpeechDetectedError extends Error {
  constructor() {
    super('No speech was detected in the audio.')
    this.name = 'NoSpeechDetectedError'
  }
}

/**
 * Whether nothing usable was said — an empty transcript, and nothing cleverer
 * than that.
 *
 * There was a confidence gate here once, and it is worth recording why it is
 * gone. Whisper is trained on subtitles, so audio it cannot parse comes back
 * not as nothing but as stock filler appended to real speech: "Hello, my name
 * is Yasir. Thank you." where only the first sentence was spoken. The obvious
 * defence is to drop low-confidence segments, and it does not work. Measured on
 * a real turn, the invented "Thank you." scored `avg_logprob` -0.52 against
 * -0.30 for the genuine sentence beside it, and `no_speech_prob` read 0.000 for
 * both. Whisper is *confident* when it invents, because the text it invents is
 * high-probability text. No threshold separates those two numbers, and one set
 * low enough to try would take real quiet speech with it.
 *
 * The fix belongs at the model, not behind it: an ASR that is not a
 * subtitle-trained autoregressive decoder returns an empty string on non-speech
 * and there is nothing left to filter. Hence this reduces to asking whether
 * anything came back at all — which is a property every provider reports
 * honestly, unlike per-segment confidence (Nemotron, for one, hardcodes
 * `avg_logprob` to 0.0).
 */
export const readsAsNonSpeech = (result: { text?: string }): boolean =>
  !(result.text ?? '').trim()

async function fetchAsUint8Array(
  url: string,
  allowedAudioHosts?: string[]
): Promise<Uint8Array> {
  const response = await safeFetch(url, {}, { allowedHosts: allowedAudioHosts })
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

export const voiceInput = (config?: {
  language?: string
  model?: string
  allowedAudioHosts?: string[]
}) =>
  pikkuAIMiddleware({
    modifyInput: async (services, { messages, instructions }) => {
      const aiAgentRunner = (
        services as {
          aiAgentRunner?: AIAgentRunnerService
        }
      ).aiAgentRunner
      if (!aiAgentRunner?.transcribe) return { messages, instructions }

      const last = messages[messages.length - 1]
      if (!last || last.role !== 'user' || typeof last.content === 'string') {
        return { messages, instructions }
      }

      const parts = last.content as AIContentPart[]
      if (!parts) return { messages, instructions }

      const hasAudio = parts.some(
        (p) => p.type === 'file' && !!p.mediaType?.startsWith('audio/')
      )
      if (!hasAudio) return { messages, instructions }

      const updatedContent: AIContentPart[] = []
      for (const p of parts) {
        if (!(p.type === 'file' && p.mediaType?.startsWith('audio/'))) {
          updatedContent.push(p)
          continue
        }
        if (!config?.model) {
          throw new Error(
            'voiceInput requires a transcription model (e.g. openai/whisper-1)'
          )
        }
        const audioData = p.data
          ? base64ToUint8Array(p.data)
          : await fetchAsUint8Array(p.url!, config.allowedAudioHosts)
        const result = await aiAgentRunner.transcribe({
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
        // Dropped when nothing was said: an empty text part is still a turn the
        // model will answer, and what it answers is a guess about what it could
        // not hear.
        if (readsAsNonSpeech(result)) continue
        updatedContent.push({ type: 'text' as const, text: result.text })
      }

      // Every part was audio, and none of it was speech. There is nothing left
      // to send, and a message with no content is not a question.
      if (updatedContent.length === 0) throw new NoSpeechDetectedError()

      return {
        messages: [
          ...messages.slice(0, -1),
          { ...last, content: updatedContent },
        ],
        instructions,
      }
    },
  })
