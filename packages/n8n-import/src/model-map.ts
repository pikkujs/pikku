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

/** Read the model id from a chat-model node (resource-locator, `model`, or `modelName`). */
function readModelId(parameters: Record<string, unknown>): string | undefined {
  const model = parameters.model
  if (model && typeof model === 'object' && 'value' in model) {
    const v = (model as { value?: unknown }).value
    if (typeof v === 'string' && v && !isDynamic(v)) return v
  }
  if (typeof model === 'string' && model && !isDynamic(model)) return model
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
