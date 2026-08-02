import type {
  SharedV3Warning,
  SpeechModelV3,
  SpeechModelV3CallOptions,
} from '@ai-sdk/provider'
import {
  definedHeaders,
  failedResponseError,
  providerExtras,
  type DeepInfraConfig,
} from './deepinfra-config.js'

/**
 * Pulls the payload out of `data:audio/wav;base64,…`.
 *
 * DeepInfra's TTS models answer with JSON holding a data URI rather than raw
 * bytes. The V3 contract says to return base64 as base64 without converting,
 * so only the prefix comes off — decoding here would mean re-encoding one
 * layer up.
 */
const stripDataUri = (audio: string): string => {
  const comma = audio.indexOf(',')
  return audio.startsWith('data:') && comma !== -1
    ? audio.slice(comma + 1)
    : audio
}

export class DeepInfraSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3' as const
  readonly provider = 'deepinfra'

  constructor(
    readonly modelId: string,
    private readonly config: DeepInfraConfig
  ) {}

  async doGenerate(options: SpeechModelV3CallOptions) {
    const warnings: SharedV3Warning[] = []

    // Surfaced rather than dropped. `voiceOutput` labels every chunk with the
    // format that came back, and the browser decodes on that label, so a
    // silently ignored setting turns into an undecodable sentence far from
    // here. A warning is the difference between a bug and a note.
    if (options.instructions) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'DeepInfra speech models take no free-text style instructions; use `voice`.',
      })
    }

    const response = await this.config.fetch(
      `${this.config.baseURL}/${this.modelId}`,
      {
        method: 'POST',
        headers: {
          ...this.config.headers(),
          'content-type': 'application/json',
          ...definedHeaders(options.headers),
        },
        body: JSON.stringify({
          // The same string under both names, because DeepInfra's TTS models do
          // not agree on one: Kokoro and Orpheus require `text`, Qwen3-TTS
          // requires `input` and rejects a body without it. Every model tested
          // accepts the other key as a harmless extra, so sending both is what
          // keeps one provider from needing a per-model field table.
          text: options.text,
          input: options.text,
          // Voice ids are per-model — Kokoro's are not Orpheus's — so the
          // value passes through untouched and the model validates it.
          preset_voice: options.voice,
          speed: options.speed,
          output_format: options.outputFormat,
          language: options.language,
          ...providerExtras(options.providerOptions),
        }),
        signal: options.abortSignal,
      }
    )

    if (!response.ok) throw await failedResponseError(this.modelId, response)

    const contentType = response.headers.get('content-type') ?? ''
    let audio: string | Uint8Array

    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { audio?: unknown }
      if (typeof payload.audio !== 'string') {
        throw new Error(
          `DeepInfra speech model '${this.modelId}' returned JSON without an 'audio' string.`
        )
      }
      audio = stripDataUri(payload.audio)
    } else {
      // Some deployments answer with the bytes directly. Handing them back
      // unconverted is what the V3 contract asks for.
      audio = new Uint8Array(await response.arrayBuffer())
    }

    return {
      audio,
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(response.headers),
      },
    }
  }
}
