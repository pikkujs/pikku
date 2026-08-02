/**
 * DeepInfra serves every model — chat, ASR, TTS alike — from one endpoint
 * shape: `POST {baseURL}/{modelId}`, with the model id as a path segment.
 *
 * That is why this package needs no per-model code: the id is opaque, so
 * `openai/whisper-large-v3-turbo` and `hexgrad/Kokoro-82M` differ only in the
 * string. Model ids contain slashes, which is fine here — nothing splits them.
 */
export const DEEPINFRA_BASE_URL = 'https://api.deepinfra.com/v1/inference'

export type DeepInfraFetch = typeof globalThis.fetch

export type DeepInfraProviderSettings = {
  /** Falls back to `DEEPINFRA_API_KEY`. */
  apiKey?: string
  /** Override for a proxy or a self-hosted deployment of the same API. */
  baseURL?: string
  /** Merged into every request. */
  headers?: Record<string, string>
  /** Injectable so tests need neither a key nor a network. */
  fetch?: DeepInfraFetch
}

export type DeepInfraConfig = {
  baseURL: string
  /**
   * Built per request rather than once, so a provider can be constructed
   * before the key exists — the throw lands on the call that needed it, where
   * the stack says which model was being reached for.
   */
  headers: () => Record<string, string>
  fetch: DeepInfraFetch
}

export const resolveConfig = (
  settings: DeepInfraProviderSettings
): DeepInfraConfig => ({
  baseURL: (settings.baseURL ?? DEEPINFRA_BASE_URL).replace(/\/+$/, ''),
  headers: () => {
    const apiKey = settings.apiKey ?? process.env.DEEPINFRA_API_KEY
    if (!apiKey) {
      throw new Error(
        'DeepInfra API key is missing. Pass `apiKey` to createDeepInfra(), or set DEEPINFRA_API_KEY.'
      )
    }
    return { authorization: `Bearer ${apiKey}`, ...settings.headers }
  },
  fetch: settings.fetch ?? globalThis.fetch,
})

/**
 * Turns a failed response into an error that names the model and carries the
 * body. DeepInfra puts the useful part (`detail`) in the body, so a bare status
 * code would throw away the only sentence explaining what was wrong.
 */
export const failedResponseError = async (
  modelId: string,
  response: Response
): Promise<Error> => {
  let detail = ''
  try {
    detail = (await response.text()).slice(0, 500)
  } catch {
    // A body that cannot be read is not worth failing differently over — the
    // status is still the story.
  }
  return new Error(
    `DeepInfra request for '${modelId}' failed with ${response.status} ${response.statusText}${
      detail ? `: ${detail}` : ''
    }`
  )
}

/**
 * Per-call header overrides, minus the `undefined` values the V3 call options
 * permit — `fetch` rejects a record that can hold them.
 */
export const definedHeaders = (
  headers: Record<string, string | undefined> | undefined
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )

/** Provider-specific extras, e.g. `{ deepinfra: { chunk_level: 'word' } }`. */
export const providerExtras = (
  providerOptions: Record<string, unknown> | undefined
): Record<string, unknown> =>
  (providerOptions?.['deepinfra'] as Record<string, unknown> | undefined) ?? {}
