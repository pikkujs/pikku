//~ name: ai-speech
//~ title: Synthesize speech from text (text → audio, TTS) — via agentRunner.generateSpeech
//~ when: The app must turn TEXT into spoken AUDIO — read a message aloud, voice a notification, narrate content, produce a voice reply. The mirror of ai-transcribe (audio → text). NOT for transcribing audio (that is ai-transcribe) and NOT for music. One-shot backend call that returns audio bytes.
//~ deferUntil: entity-write
//~ lang: ts
//~ steps:
//~ ═══ CLIENT SIDE — synthesize + play ═══
//~ usePikkuMutation with isPending/error for the button + INLINE feedback — never a toast:
//~
//~   const speak = usePikkuMutation('synthesizeSpeech')
//~   // <Button loading={speak.isPending} onClick={() => speak.mutate({ text })}>
//~   // {speak.error && <Text c="red">{asI18n(speak.error.message)}</Text>}
//~   // {speak.data && <audio controls src={speak.data.dataUrl} />}
// ===== FILE: packages/functions/src/functions/synthesize-speech.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { defineVariable } from '@pikku/core/variable'

//~ Text→speech WORKS OUT OF THE BOX on a Fabric sandbox — no addon, no API key, no
//~ services.ts edit. The proxy routes `kokoro-82m` with `mode: audio_speech`, and the
//~ platform wires each provider as an object carrying a `speech` method. (An older
//~ revision said the opposite; it predates both. The guard below stays only for an app
//~ running against some OTHER AI wiring.)
//~
//~ ⚠️ Kokoro's VOICES ARE PER-LANGUAGE, and it does not refuse a language it cannot
//~ speak — handed Arabic with the default American-English voice it reads out letter
//~ names ("Arabic meem, Arabic ra") for 24 seconds. Pick the voice from the text's
//~ script, and refuse a script you have no voice for; a proxy entry cannot express that,
//~ so it is this function's job.

//~ The TTS model, as config rather than a literal so a stage can swap it. `openai/` picks
//~ the OpenAI-compatible HANDLER, not the vendor — kokoro-82m is served by DeepInfra.
defineVariable({
  name: 'AI_SPEECH_MODEL',
  displayName: 'Speech model',
  description: 'Provider-prefixed text-to-speech model id routed by the proxy.',
  variableId: 'AI_SPEECH_MODEL',
  schema: z.string().default('openai/kokoro-82m'),
})

export const SynthesizeSpeechInput = z.object({
  text: z.string().min(1).describe('The text to speak.'),
  //~ Voice name is provider-specific (e.g. OpenAI: alloy, echo, fable, …). Optional —
  //~ the model uses its default when omitted.
  voice: z.string().optional(),
})
export const SynthesizeSpeechOutput = z.object({
  //~ The audio as a data URL (`data:<mediaType>;base64,<...>`) so the client can play it
  //~ directly. For anything you keep, PERSIST it instead: upload the bytes via the
  //~ file-upload scaffold and return the stored URL — do not stream large audio through
  //~ every response. This inline form is for preview/one-off playback.
  dataUrl: z.string(),
  mediaType: z.string(),
})

//~ Destructuring `agentRunner` tags this unit with the `ai-model` capability (keeps
//~ the AI SDK bundled) and gives us generateSpeech. It is optional — guard it.
export const synthesizeSpeech = pikkuFunc({
  expose: true,
  auth: true,
  readonly: true, //~ pure synthesis — returns audio, writes nothing itself
  description: 'Synthesize spoken audio from text (text-to-speech).',
  input: SynthesizeSpeechInput,
  output: SynthesizeSpeechOutput,
  func: async ({ agentRunner, variables }, input) => {
    if (!agentRunner) {
      throw new Error('agentRunner not configured — AI is unavailable in this stage')
    }
    if (!agentRunner.generateSpeech) {
      //~ Not reachable on a stock Fabric sandbox — only if this app replaced the AI
      //~ wiring. Fail loud and actionable rather than 500.
      throw new Error(
        'Text-to-speech is not enabled: this app’s AI runner has no speech model. ' +
          'The runner needs a provider exposing a `speech` method ' +
          '(a bare chat-model function only satisfies language models).',
      )
    }
    const model = await variables.get('AI_SPEECH_MODEL')
    const { audio } = await agentRunner.generateSpeech({
      model,
      text: input.text,
      voice: input.voice,
    })
    return {
      dataUrl: `data:${audio.mediaType};base64,${audio.base64}`,
      mediaType: audio.mediaType,
    }
  },
})
