import type {
  SharedV3Warning,
  TranscriptionModelV3,
  TranscriptionModelV3CallOptions,
} from '@ai-sdk/provider'
import {
  definedHeaders,
  failedResponseError,
  providerExtras,
  type DeepInfraConfig,
} from './deepinfra-config.js'

/** Extensions DeepInfra's ASR responses are known to use. */
type DeepInfraTranscriptionResponse = {
  text?: string
  language?: string
  input_length_ms?: number
  segments?: unknown
}

/**
 * Whatever the caller handed us, as bytes. The V3 contract allows a base64
 * string as well as a `Uint8Array`.
 */
const toBytes = (audio: Uint8Array | string): Uint8Array =>
  typeof audio === 'string'
    ? Uint8Array.from(Buffer.from(audio, 'base64'))
    : audio

/**
 * A filename with a plausible extension.
 *
 * Multipart uploads carry the media type on the part, but DeepInfra — like
 * most Whisper deployments — also sniffs the extension, and a name it cannot
 * place is a decode failure rather than a fallback.
 */
const filenameFor = (mediaType: string): string => {
  const subtype = mediaType.split('/')[1]?.split(';')[0] ?? 'wav'
  const extension =
    subtype === 'mpeg' ? 'mp3' : subtype === 'x-wav' ? 'wav' : subtype
  return `audio.${extension}`
}

/**
 * Segments, defensively.
 *
 * Timings are the one part of the response we cannot verify without calling
 * the real thing, and they are not worth failing a transcript over: a caller
 * that only wants `text` should still get it if a segment is malformed. So
 * anything unrecognisable is dropped rather than coerced into a wrong number.
 */
const toSegments = (
  raw: unknown
): Array<{ text: string; startSecond: number; endSecond: number }> => {
  if (!Array.isArray(raw)) return []

  const segments: Array<{
    text: string
    startSecond: number
    endSecond: number
  }> = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const start = record['start'] ?? record['startSecond']
    const end = record['end'] ?? record['endSecond']
    const text = record['text']
    if (
      typeof text !== 'string' ||
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isFinite(start) ||
      !Number.isFinite(end)
    ) {
      continue
    }
    segments.push({ text, startSecond: start, endSecond: end })
  }

  return segments
}

/**
 * Per-segment confidence, reported for inspection and explicitly not to be
 * filtered on.
 *
 * Whisper was trained on subtitles, so noise it cannot parse does not come back
 * as nothing — it comes back as stock subtitle filler appended to whatever was
 * really said. It is tempting to drop the low-confidence segments, and callers
 * should not, because these numbers do not support it. Measured on a real turn
 * where "Thank you." was invented after a genuine question:
 *
 *     no_speech 0.000  logprob -0.30  "Hey, is this working okay?"   (spoken)
 *     no_speech 0.000  logprob -0.52  "Thank you."                   (invented)
 *
 * Neither field separates them. `no_speech` reads 0.000 for both, and the
 * logprobs are a fifth of a nat apart — Whisper is confident when it invents,
 * because the text it invents is high-probability text. A threshold loose
 * enough to catch -0.52 eats real speech, and one tight enough to spare real
 * speech never fires.
 *
 * Nor are the fields portable: Nemotron returns segments with `avg_logprob`
 * hardcoded to 0.0, so a filter written against Whisper silently becomes a
 * no-op — or, worse, a drop-everything — on a different model behind the same
 * provider. Treat these as diagnostics for a human looking at a waveform.
 */
const speechConfidence = (
  raw: unknown
):
  | Array<{
      text: string
      startSecond: number
      endSecond: number
      noSpeechProbability: number
      avgLogProbability: number
    }>
  | undefined => {
  if (!Array.isArray(raw) || raw.length === 0) return undefined

  const scored: Array<{
    text: string
    startSecond: number
    endSecond: number
    noSpeechProbability: number
    avgLogProbability: number
  }> = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const text = record['text']
    const start = record['start']
    const end = record['end']
    const p = record['no_speech_prob']
    const lp = record['avg_logprob']
    if (
      typeof text !== 'string' ||
      typeof p !== 'number' ||
      typeof lp !== 'number'
    ) {
      continue
    }
    scored.push({
      text,
      startSecond: typeof start === 'number' ? start : 0,
      endSecond: typeof end === 'number' ? end : 0,
      noSpeechProbability: p,
      avgLogProbability: lp,
    })
  }

  return scored.length > 0 ? scored : undefined
}

export class DeepInfraTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3' as const
  readonly provider = 'deepinfra'

  constructor(
    readonly modelId: string,
    private readonly config: DeepInfraConfig
  ) {}

  async doGenerate(options: TranscriptionModelV3CallOptions) {
    const warnings: SharedV3Warning[] = []

    const body = new FormData()
    body.append(
      // DeepInfra names the part `audio`; OpenAI names it `file`. This is the
      // whole reason the OpenAI-compatible client cannot be pointed here.
      'audio',
      new Blob([toBytes(options.audio) as BlobPart], {
        type: options.mediaType,
      }),
      filenameFor(options.mediaType)
    )

    for (const [key, value] of Object.entries(
      providerExtras(options.providerOptions)
    )) {
      if (value !== undefined && value !== null) body.append(key, String(value))
    }

    const response = await this.config.fetch(
      `${this.config.baseURL}/${this.modelId}`,
      {
        method: 'POST',
        // No content-type: fetch sets it, with the multipart boundary.
        headers: {
          ...this.config.headers(),
          ...definedHeaders(options.headers),
        },
        body,
        // Barge-in has to cancel work that is genuinely in flight, not merely
        // stop reading its result.
        signal: options.abortSignal,
      }
    )

    if (!response.ok) throw await failedResponseError(this.modelId, response)

    const payload = (await response.json()) as DeepInfraTranscriptionResponse
    const confidence = speechConfidence(payload.segments)

    return {
      text: payload.text ?? '',
      segments: toSegments(payload.segments),
      // Nemotron reports the literal string 'auto' when it was not asked to
      // detect a language. That is a mode, not a language tag, and passing it
      // on as one would have callers matching it against BCP-47.
      language: payload.language === 'auto' ? undefined : payload.language,
      durationInSeconds:
        typeof payload.input_length_ms === 'number'
          ? payload.input_length_ms / 1000
          : undefined,
      warnings,
      ...(confidence
        ? { providerMetadata: { deepinfra: { segments: confidence } } }
        : {}),
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(response.headers),
        body: payload,
      },
    }
  }
}
