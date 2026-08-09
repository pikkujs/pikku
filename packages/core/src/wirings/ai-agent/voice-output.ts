import type { AIAgentRunnerService } from '../../services/ai-agent-runner-service.js'
import { pikkuAIMiddleware } from '../../types/core.types.js'
import { SPOKEN_TURN } from './voice-input.js'

type VoiceOutputState = {
  textBuffer?: string
  /**
   * The audio emitted so far, as a chain.
   *
   * Synthesis for every finished sentence starts immediately, so the second
   * sentence is being generated while the first is still being spoken. That
   * also means the second can finish first — a short sentence after a long one
   * routinely does. Chaining the *emissions* keeps the client receiving audio
   * in the order it was written while leaving the generation overlapped.
   */
  tail?: Promise<void>
  /** Whether this reply has already said it cannot be spoken aloud. */
  reportedUnspeakable?: boolean
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

/**
 * Scripts a speech model can pronounce, as named by {@link voiceOutput}'s
 * `speakableScripts`.
 *
 * Script rather than language because script is what is decidable from the text
 * alone. Spanish, French and English are one test, not three — and the models
 * that handle one Latin-script language generally handle the others. What a
 * model cannot do is invent a phoneme set it was never given.
 */
const SCRIPT_RANGES: Record<string, RegExp> = {
  latin: /[A-ɏ]/,
  devanagari: /[ऀ-ॿ]/,
  han: /[㐀-鿿]/,
  kana: /[぀-ヿ]/,
  arabic: /[؀-ۿݐ-ݿ]/,
  cyrillic: /[Ѐ-ӿ]/,
  hangul: /[가-힯ᄀ-ᇿ]/,
  hebrew: /[֐-׿]/,
  greek: /[Ͱ-Ͽ]/,
  thai: /[฀-๿]/,
}

/**
 * The scripts a model can pronounce, and optionally the voice each one needs.
 *
 * The array form is for a model whose voice is the same whatever the script.
 * The record form exists because that is not the common case: Kokoro speaks
 * Mandarin, Japanese and Hindi well, but only through a voice belonging to that
 * language. Asked for Chinese in its default American-English voice it spells
 * the characters out — 9.9 seconds of "Chinese letter, Chinese letter" for a
 * sentence the right voice says in 3.5. Same model, same text, same price.
 */
export type SpeakableScripts = string[] | Record<string, string>

/**
 * Which script decides the voice when a sentence contains several.
 *
 * The ordering is by how much a script narrows down the language, not by
 * preference. Kana appears only in Japanese, so a sentence holding any settles
 * it — while Han is written in both Chinese and Japanese and so cannot, which
 * matters because ordinary Japanese is mostly kanji. Latin comes last for the
 * same reason from the other end: it turns up inside sentences in every other
 * script, and it is the one whose voice is least often the one that counts. A
 * Chinese voice reading an English word is accented; an English voice reading
 * Chinese spells it out.
 *
 * Everything else — Han included — sits between the two in config order.
 */
const SCRIPT_PRECEDENCE: Record<string, number> = { kana: -1, latin: 1 }

const scriptRank = (name: string): number => SCRIPT_PRECEDENCE[name] ?? 0

const scriptNames = (speakable: SpeakableScripts): string[] =>
  Array.isArray(speakable) ? speakable : Object.keys(speakable)

/**
 * The scripts present in `text` that the model was not said to handle.
 *
 * Silence would be the wrong answer here and so would a best effort. Handed
 * Arabic — which it has no voice for at all — Kokoro does not fail and does not
 * stay quiet: it reads out the *letter names*, twenty-four seconds of "Arabic
 * meem, Arabic ra" for a one-line sentence, which is worse than either. Naming
 * the gap lets the caller say so instead.
 */
export const unspeakableScripts = (
  text: string,
  speakable: SpeakableScripts
): string[] => {
  const allowed = new Set(scriptNames(speakable))
  return Object.entries(SCRIPT_RANGES)
    .filter(([name, range]) => !allowed.has(name) && range.test(text))
    .map(([name]) => name)
}

/**
 * The voice to speak `text` in, or `fallback` if no mapped script appears.
 *
 * A sentence is regularly in more than one script, so which one decides is
 * settled by {@link SCRIPT_PRECEDENCE} rather than by the order the config
 * happens to be written in.
 */
export const voiceForText = (
  text: string,
  speakable: SpeakableScripts,
  fallback?: string
): string | undefined => {
  if (Array.isArray(speakable)) return fallback
  const mapped = Object.entries(speakable).sort(
    ([a], [b]) => scriptRank(a) - scriptRank(b)
  )
  for (const [name, voice] of mapped) {
    if (SCRIPT_RANGES[name]?.test(text)) return voice
  }
  return fallback
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
    abortSignal?: AbortSignal
  }
): Promise<{ bytes: Uint8Array; format: string }> {
  const result = await aiAgentRunner.generateSpeech?.({
    model: input.model,
    text: input.text,
    voice: input.voice,
    outputFormat: input.format,
    instructions: input.instructions,
    speed: input.speed,
    language: input.language,
    abortSignal: input.abortSignal,
  })
  if (!result) {
    throw new Error(
      'voiceOutput requires an aiAgentRunner with generateSpeech support'
    )
  }
  return {
    bytes: result.audio.uint8Array,
    format: result.audio.format || input.format || 'pcm16',
  }
}

export const voiceOutput = (config?: {
  model?: string
  format?: string
  voice?: string
  instructions?: string
  speed?: number
  language?: string
  /**
   * Scripts the configured model can actually pronounce, and the voice each
   * needs — see {@link SpeakableScripts}. Anything written in another script is
   * left unspoken and reported once, as a `voice-unsupported` data event,
   * rather than sent to a model that will mangle it.
   *
   * Omitted means no check: every model is trusted with every script, which is
   * the right default for a provider that genuinely is multilingual.
   */
  speakableScripts?: SpeakableScripts
  /**
   * Speak every reply, including answers to turns that were typed.
   *
   * The default is to speak only what was spoken to. An agent is usually one
   * agent serving both kinds of caller — the same thread is typed at from a
   * desk and talked to from a phone — and synthesizing a reply nobody is
   * listening to costs real money on every sentence of every turn. Whether the
   * user is in a call is not something the client needs to declare: sending
   * audio is what saying so looks like.
   *
   * Set this for the cases where speech is not a reply to speech at all — a
   * read-aloud accessibility mode, a kiosk, anything whose whole output is
   * meant to be heard.
   */
  always?: boolean
}) =>
  pikkuAIMiddleware<VoiceOutputState>({
    modifyOutputStream: async (
      services,
      { event, state, shared, emit, signal }
    ) => {
      const { aiAgentRunner, logger } = services as {
        aiAgentRunner?: AIAgentRunnerService
        logger?: { error: (message: string) => void }
      }
      if (!aiAgentRunner?.generateSpeech) return event

      // knowledge: decisions/internals/voice-output-speaks-unless-voice-input-explicitly-says-otherwise.md
      if (!config?.always && shared[SPOKEN_TURN] === false) return event

      /**
       * Queue a finished sentence for speech.
       *
       * Nothing here is awaited by the caller. Synthesis is kicked off at once
       * and its emission is chained behind the previous sentence, which is
       * what keeps the text flowing at the speed the model writes it instead
       * of the speed the speech provider answers.
       */
      const speak = (text: string) => {
        if (!config?.model) {
          throw new Error(
            'voiceOutput requires a speech model (e.g. openai/tts-1)'
          )
        }

        // knowledge: decisions/internals/speech-synthesis-picks-a-voice-per-sentence-and-warns-once.md
        let voice = config.voice
        if (config.speakableScripts) {
          const unspeakable = unspeakableScripts(text, config.speakableScripts)
          voice = voiceForText(text, config.speakableScripts, config.voice)
          if (unspeakable.length > 0) {
            if (!state.reportedUnspeakable) {
              state.reportedUnspeakable = true
              state.tail = (state.tail ?? Promise.resolve()).then(() =>
                emit({
                  type: 'data',
                  name: 'voice-unsupported',
                  data: { model: config.model, scripts: unspeakable },
                })
              )
            }
            return
          }
        }
        // Settled into a value rather than left as a rejectable promise: it
        // sits unobserved until the chain reaches it, and an unhandled
        // rejection in that window would take the process down.
        const synthesis = synthesizeAudio(aiAgentRunner, {
          model: config.model,
          text,
          voice,
          format: config?.format,
          instructions: config?.instructions,
          speed: config?.speed,
          language: config?.language,
          // Barge-in should stop the bill, not just the playback. Without this
          // every sentence already in flight is synthesized in full and paid
          // for after the user has stopped listening.
          abortSignal: signal,
        }).then(
          (audio) => ({ ok: true as const, audio }),
          (error: unknown) => ({ ok: false as const, error })
        )

        state.tail = (state.tail ?? Promise.resolve()).then(async () => {
          const result = await synthesis
          if (!result.ok) {
            // One sentence going unspoken is better than the rest of the reply
            // never arriving, so the chain carries on.
            logger?.error(
              `voiceOutput could not synthesize a sentence: ${String(result.error)}`
            )
            return
          }
          await emit({
            type: 'audio-delta',
            data: bufferToBase64(result.audio.bytes),
            format: result.audio.format,
            text,
          })
        })
      }

      if (event.type === 'done') {
        const remaining = state.textBuffer ?? ''
        state.textBuffer = ''
        if (remaining.trim()) {
          speak(remaining)
        }
        // The only place this hook waits. The reply is already over, so the
        // wait costs the reader nothing, and it is what makes `audio-done`
        // mean what it says rather than racing the last chunk.
        await state.tail
        state.tail = undefined
        return [{ type: 'audio-done' as const }, event]
      }

      if (event.type !== 'text-delta') return event

      state.textBuffer = `${state.textBuffer ?? ''}${event.text}`
      if (isSentenceBoundary(state.textBuffer)) {
        const text = state.textBuffer
        state.textBuffer = ''
        speak(text)
      }

      // Returned without waiting for any audio — the entire point.
      return event
    },
  })
