//~ name: ai-transcribe
//~ title: Transcribe audio → text (speech-to-text) — via agentRunner.transcribe, NEEDS an STT model wired
//~ when: The app must turn AUDIO into text — transcribe a voice note, recording, podcast, meeting, or call; generate captions/subtitles from an audio track; any "speech-to-text". The audio usually arrives via the file-upload scaffold (upload → getFileViewUrl → fetch the bytes here). NOT for text→speech (that is agentRunner.generateSpeech) and NOT for reading text off an image (that is the ai-vision / OCR scaffold).
//~ deferUntil: entity-write
//~ lang: ts
//~ steps:
//~ ═══ CLIENT SIDE — transcribe an uploaded recording ═══
//~ Upload the audio (file-upload scaffold), then feed the returned url here.
//~ usePikkuMutation with isPending/error for the button + INLINE feedback — never a toast:
//~
//~   const transcribe = usePikkuMutation('transcribeAudio')
//~   // <Button loading={transcribe.isPending} onClick={() => transcribe.mutate({ audioUrl })}>
//~   // {transcribe.error && <Text c="red">{asI18n(transcribe.error.message)}</Text>}
//~   // {transcribe.data && <Text>{transcribe.data.text}</Text>}
// ===== FILE: packages/functions/src/functions/transcribe-audio.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

//~ Speech-to-text WORKS OUT OF THE BOX on a Fabric sandbox — no addon, no API key, no
//~ services.ts edit. Use this scaffold directly; do not ask the user to choose a
//~ transcription provider, and do not reach for `@pikku/addon-mistral` instead.
//~
//~ Two things make it work, and both are already done for you:
//~   • the LiteLLM proxy routes real ASR models alongside the chat ones —
//~     `whisper-large-v3-turbo` and `nemotron-asr` (both DeepInfra) and
//~     `gpt-4o-transcribe` (OpenAI), each carrying `mode: audio_transcription`;
//~   • the platform wires each provider as an OBJECT with a `transcription`
//~     method, not a bare chat-model function, so the runner can resolve a
//~     transcription model rather than only a language one. Nothing to do in
//~     services.ts — the runner arrives injected.
//~
//~ (An older revision of this file claimed the opposite. It was written when the
//~ template registered plain chat-model functions, which satisfy `language` and nothing
//~ else — that is the "provider does not support transcription models" error. Both
//~ halves are fixed; the guard below stays only so an app running against some OTHER
//~ AI wiring fails with a sentence instead of a mystery 500.)

//~ Provider-prefixed id of an ASR model the proxy routes. The `openai/` prefix picks the
//~ HANDLER (the OpenAI-compatible `/v1/audio/transcriptions` shape) — it does not mean
//~ OpenAI is the vendor; whisper-large-v3-turbo is served by DeepInfra behind the proxy.
//~
//~ Prefer whisper here over `nemotron-asr`: nemotron is a STREAMING model handed a whole
//~ file, and it drops the tail of what it is given ("I said yes" → "I said ye"). Losing
//~ the last words of a sentence is survivable in a live conversation and is not in a
//~ transcript somebody will read back. Whisper's own failure runs the other way — it
//~ answers silence with invented filler ("Thank you.") — so a recording that opens or
//~ closes on room tone gets a line that was never spoken. Neither is fixable from the
//~ caller; say which one you picked when you show the user the transcript.
const STT_MODEL = 'openai/whisper-large-v3-turbo'

export const TranscribeAudioInput = z.object({
  //~ A viewable audio URL — pass the one getFileViewUrl returns (see file-upload), or
  //~ any public audio URL. We fetch the bytes below; the STT API needs raw bytes.
  audioUrl: z.string().url(),
})
export const TranscribeAudioOutput = z.object({
  text: z.string(),
  //~ Whisper-style outputs include per-segment timings — handy for captions. Optional
  //~ because a given STT model may not return them.
  language: z.string().optional(),
  durationInSeconds: z.number().optional(),
})

//~ Destructuring `agentRunner` tags this unit with the `ai-model` capability (keeps
//~ the AI SDK bundled) and gives us the transcribe method — the same runner that powers
//~ pikkuAgent. It is optional, so guard it.
export const transcribeAudio = pikkuFunc({
  expose: true,
  auth: true,
  readonly: true, //~ pure read — turns audio into text, writes nothing
  description: 'Transcribe an audio file to text (speech-to-text).',
  input: TranscribeAudioInput,
  output: TranscribeAudioOutput,
  func: async ({ agentRunner }, input) => {
    if (!agentRunner) {
      throw new Error('agentRunner not configured — AI is unavailable in this stage')
    }
    if (!agentRunner.transcribe) {
      //~ Not reachable on a stock Fabric sandbox — only if this app replaced the AI
      //~ wiring. Fail loud and actionable rather than 500.
      throw new Error(
        'Speech-to-text is not enabled: this app’s AI runner has no transcription model. ' +
          'The runner needs a provider exposing a `transcription` method ' +
          '(a bare chat-model function only satisfies language models).',
      )
    }
    //~ STT wants raw bytes, so fetch the audio and hand over a Uint8Array. `fetch` and
    //~ the Web streams API are available in the sandbox (bun/node) and a CF Worker.
    const res = await fetch(input.audioUrl)
    if (!res.ok) {
      throw new Error(`could not fetch audio (${res.status})`)
    }
    const audio = new Uint8Array(await res.arrayBuffer())

    const result = await agentRunner.transcribe({ model: STT_MODEL, audio })
    return {
      text: result.text,
      language: result.language,
      durationInSeconds: result.durationInSeconds,
    }
  },
})
