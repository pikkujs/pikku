// pi extension: an OpenAI-compatible proxy as a pi provider.
//
// Set by @pikku/builder when the chosen AI is a proxy (a LiteLLM key from Fabric, or any
// OpenAI-compatible endpoint) rather than a provider pi knows by name. Does nothing
// without PIKKU_BUILDER_PROXY_URL, so it is safe to load on every run.

export default function (pi) {
  const baseUrl = process.env.PIKKU_BUILDER_PROXY_URL
  const model = process.env.PIKKU_BUILDER_PROXY_MODEL
  if (!baseUrl || !model || !process.env.PIKKU_BUILDER_PROXY_KEY) return
  pi.registerProvider('pikku-proxy', {
    name: 'Pikku proxy',
    baseUrl,
    apiKey: '$PIKKU_BUILDER_PROXY_KEY',
    api: 'openai-completions',
    authHeader: true,
    models: [
      {
        id: model,
        name: model,
        reasoning: false,
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 16384,
      },
    ],
  })
}
