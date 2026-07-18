import type { ParsedNode } from './types.js'

/**
 * n8n LangChain chat-model node → Pikku provider prefix. Embeddings nodes are
 * not agent models and are intentionally absent (RAG is tracked in #902).
 */
const PROVIDER_BY_TYPE: Record<string, string> = {
  lmChatOpenAi: 'openai',
  lmOpenAi: 'openai',
  lmChatAnthropic: 'anthropic',
  lmChatGoogleGemini: 'google',
  lmChatGoogleVertex: 'google',
  lmChatOllama: 'ollama',
  lmOllama: 'ollama',
  lmChatMistralCloud: 'mistral',
  lmChatGroq: 'groq',
  lmChatOpenRouter: 'openrouter',
  lmChatDeepSeek: 'deepseek',
  lmChatAzureOpenAi: 'openai',
}

/**
 * A model id chosen at runtime (`={{ … }}` / an expression) is not a static
 * Pikku model — treat it as absent so the caller falls back to the TODO default.
 */
function isDynamic(v: string): boolean {
  return v.startsWith('=') || v.includes('{{')
}

/**
 * Read the model id from a chat-model or `openAi` node. Handles a resource
 * locator (`{ value }`), a plain string, `modelName`, and the base `openAi`
 * node's `modelId` — in either resource-locator or string form.
 */
function readModelId(parameters: Record<string, unknown>): string | undefined {
  for (const key of ['model', 'modelId'] as const) {
    const value = parameters[key]
    if (value && typeof value === 'object' && 'value' in value) {
      const v = (value as { value?: unknown }).value
      if (typeof v === 'string' && v && !isDynamic(v)) return v
    }
    if (typeof value === 'string' && value && !isDynamic(value)) return value
  }
  const modelName = parameters.modelName
  if (typeof modelName === 'string' && modelName && !isDynamic(modelName)) {
    // Gemini reports `models/gemini-1.5-flash`; the provider prefix is added below.
    return modelName.replace(/^models\//, '')
  }
  return undefined
}

/**
 * Map an n8n chat-model sub-node to a Pikku agent `model` (`provider/model`) and
 * optional `temperature`. Returns undefined when the node type isn't a known
 * chat model or carries no model id — the caller falls back to a TODO default.
 */
export function mapModel(
  node: ParsedNode
): { model: string; temperature?: number } | undefined {
  const provider = PROVIDER_BY_TYPE[node.typeShort]
  if (!provider) return undefined
  const modelId = readModelId(node.parameters)
  if (!modelId) return undefined

  const options = node.parameters.options as Record<string, unknown> | undefined
  const temperatureRaw = options?.temperature ?? node.parameters.temperature
  const temperature =
    typeof temperatureRaw === 'number' ? temperatureRaw : undefined

  return { model: `${provider}/${modelId}`, temperature }
}

/**
 * Map a base n8n `openAi` node's INLINE model to a Pikku agent model. Unlike a
 * LangChain chat-model sub-node (see `mapModel`), the `openAi` node carries its
 * model in its own `model` / `modelId` parameter and its provider is always
 * `openai`. Returns undefined when no static model id is present so the caller
 * falls back to the TODO default — the same contract as `mapModel`.
 */
export function mapOpenAiNodeModel(
  node: ParsedNode
): { model: string; temperature?: number } | undefined {
  const modelId = readModelId(node.parameters)
  if (!modelId) return undefined

  const options = node.parameters.options as Record<string, unknown> | undefined
  const temperatureRaw = options?.temperature ?? node.parameters.temperature
  const temperature =
    typeof temperatureRaw === 'number' ? temperatureRaw : undefined

  return { model: `openai/${modelId}`, temperature }
}
