import type { SpeechModelV3, TranscriptionModelV3 } from '@ai-sdk/provider'
import {
  resolveConfig,
  type DeepInfraProviderSettings,
} from './deepinfra-config.js'
import { DeepInfraSpeechModel } from './speech-model.js'
import { DeepInfraTranscriptionModel } from './transcription-model.js'

export type {
  DeepInfraConfig,
  DeepInfraFetch,
  DeepInfraProviderSettings,
} from './deepinfra-config.js'
export { DEEPINFRA_BASE_URL } from './deepinfra-config.js'
export { DeepInfraSpeechModel } from './speech-model.js'
export { DeepInfraTranscriptionModel } from './transcription-model.js'

export type DeepInfraProvider = {
  transcription(modelId: string): TranscriptionModelV3
  speech(modelId: string): SpeechModelV3
  /**
   * Same objects under the alternative names. Runners probe for one or the
   * other — pikku's checks `transcription|transcriptionModel` — and which one
   * a given version looks for is not worth a support thread.
   */
  transcriptionModel(modelId: string): TranscriptionModelV3
  speechModel(modelId: string): SpeechModelV3
}

/**
 * Transcription and speech models served by DeepInfra.
 *
 * Model ids are DeepInfra's own and contain a slash — the HuggingFace org that
 * published the weights, then the model:
 *
 * ```ts
 * const deepinfra = createDeepInfra()
 * deepinfra.transcription('openai/whisper-large-v3-turbo')
 * deepinfra.speech('hexgrad/Kokoro-82M')
 * ```
 *
 * `openai/` there names who trained it, not who is serving it. Under pikku the
 * full string gains a provider prefix — `deepinfra/openai/whisper-large-v3-turbo`
 * — and only the first slash is significant.
 *
 * Deliberately no language models: `@ai-sdk/deepinfra` already covers those,
 * and only audio is missing.
 */
export const createDeepInfra = (
  settings: DeepInfraProviderSettings = {}
): DeepInfraProvider => {
  const config = resolveConfig(settings)

  const transcription = (modelId: string) =>
    new DeepInfraTranscriptionModel(modelId, config)
  const speech = (modelId: string) => new DeepInfraSpeechModel(modelId, config)

  return {
    transcription,
    speech,
    transcriptionModel: transcription,
    speechModel: speech,
  }
}

/** Default instance, reading `DEEPINFRA_API_KEY` when first called. */
export const deepinfra = createDeepInfra()
