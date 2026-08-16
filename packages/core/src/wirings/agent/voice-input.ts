import type { AgentRunnerService } from '../../services/agent-runner-service.js'
import { pikkuAgentMiddleware } from '../../middleware/middleware-factories.js'
import { safeFetch } from '../../utils/safe-fetch.js'
import type { AgentContentPart } from './agent.types.js'

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

/**
 * Shared-notes key recording whether the user's turn arrived as audio.
 *
 * Written here because this is the last point at which it is knowable: the
 * transcript that replaces the audio is indistinguishable from something typed.
 * Read by `voiceOutput` to decide whether to answer aloud.
 *
 * Absent — rather than `false` — when this middleware is not wired at all, which
 * is what lets `voiceOutput` still speak for a caller that has no voice input.
 */
export const SPOKEN_TURN = 'voice:spokenTurn'

/**
 * Shared-notes key holding what the user was heard to say, when they spoke.
 *
 * Absent on a typed turn. Read by the stream wiring, which forwards it to the
 * client as a `transcript` event — a voice client has no idea what its own
 * audio said, and without this the user's turn shows up in the UI as an empty
 * bubble followed by an answer to a question they cannot see.
 */
export const SPOKEN_TRANSCRIPT = 'voice:transcript'

export const voiceInput = (config?: {
  language?: string
  model?: string
  allowedAudioHosts?: string[]
}) =>
  pikkuAgentMiddleware({
    modifyInput: async (services, { messages, instructions, shared }) => {
      const agentRunner = (
        services as {
          agentRunner?: AgentRunnerService
        }
      ).agentRunner
      if (!agentRunner?.transcribe) return { messages, instructions }

      const last = messages[messages.length - 1]
      const parts =
        last?.role === 'user' && typeof last.content !== 'string'
          ? (last.content as AgentContentPart[] | undefined)
          : undefined

      const hasAudio = !!parts?.some(
        (p) => p.type === 'file' && !!p.mediaType?.startsWith('audio/')
      )
      // Recorded on every turn this middleware sees, spoken or not, so that a
      // typed turn is an explicit `false` downstream rather than a silence that
      // could equally mean nobody was asked.
      shared[SPOKEN_TURN] = hasAudio
      if (!hasAudio || !parts) return { messages, instructions }

      const updatedContent: AgentContentPart[] = []
      const heard: string[] = []
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
        if (audioData.byteLength > MAX_AUDIO_SIZE) {
          throw new Error('Audio file exceeds maximum size')
        }
        const result = await agentRunner.transcribe({
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
        heard.push(result.text)
        updatedContent.push({ type: 'text' as const, text: result.text })
      }

      // Every part was audio, and none of it was speech. There is nothing left
      // to send, and a message with no content is not a question.
      if (updatedContent.length === 0) throw new NoSpeechDetectedError()

      // knowledge: decisions/internals/an-empty-transcript-is-not-recorded.md
      if (heard.length > 0) {
        shared[SPOKEN_TRANSCRIPT] = heard.join(' ')
      }

      return {
        messages: [
          ...messages.slice(0, -1),
          { ...last, content: updatedContent },
        ],
        instructions,
      }
    },
  })
