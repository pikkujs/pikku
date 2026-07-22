import { createRequire } from 'module'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { Logger, VariablesService } from '@pikku/core/services'
import type { AIAgentRunnerService } from '@pikku/core/services'

// Provider prefixes a fabric/proxy baseURL fronts. Models are written as
// `openai/gpt-4o-mini`, `openai/deepseek-v4-flash`, etc. — the runner splits on
// the first `/`, so the prefix only selects the provider entry and the bare
// model name is forwarded to the OpenAI-compatible proxy, which routes it.
const PROXY_PROVIDER_NAMES = [
  'openai',
  'anthropic',
  'google',
  'gemini',
  'deepseek',
  'xai',
  'litellm',
]

/**
 * Build the AI agent runner for `pikku dev` from env.
 *
 * Deployed agent units get their runner wired by the bundler; the dev server
 * has no equivalent, so agents 503 with AIProviderNotConfiguredError unless we
 * construct one here. When an OpenAI-compatible base URL + key are present
 * (fabric injects LITELLM_PROXY_URL/LITELLM_API_KEY; the standard OPENAI_*
 * vars are also honored) we point a single openai-compatible provider at it and
 * register it under every common provider prefix. Returns undefined when no AI
 * env is configured (agents stay disabled, with the clear downstream error) or
 * when the AI SDK packages aren't installed in the project.
 */
export async function createDevAIAgentRunner({
  logger,
  projectRoot,
  variables,
}: {
  logger: Logger
  projectRoot: string
  variables: VariablesService
}): Promise<AIAgentRunnerService | undefined> {
  // Pair the URL with its matching key — coalescing each var independently could
  // combine an OPENAI_BASE_URL with a LITELLM_API_KEY (or vice versa) and
  // misroute or 401 every call. Take a complete OpenAI pair first, else LiteLLM.
  const openAIBaseURL = await variables.get('OPENAI_BASE_URL')
  const openAIApiKey = await variables.get('OPENAI_API_KEY')
  const liteLLMBaseURL = await variables.get('LITELLM_PROXY_URL')
  const liteLLMApiKey = await variables.get('LITELLM_API_KEY')

  const [baseURL, apiKey] =
    openAIBaseURL && openAIApiKey
      ? [openAIBaseURL, openAIApiKey]
      : liteLLMBaseURL && liteLLMApiKey
        ? [liteLLMBaseURL, liteLLMApiKey]
        : [undefined, undefined]

  if (!baseURL || !apiKey) {
    logger.debug(
      'pikku dev: no AI provider env (OPENAI_BASE_URL/OPENAI_API_KEY or LITELLM_PROXY_URL/LITELLM_API_KEY) — AI agents disabled'
    )
    return undefined
  }

  // Resolve from the project's node_modules — the AI SDK packages are the
  // project's deps, not the CLI's, so they share the project's `ai` version.
  const require = createRequire(
    pathToFileURL(join(projectRoot, 'package.json')).href
  )
  let VercelAIAgentRunner: any
  let createOpenAICompatible: any
  try {
    ;({ VercelAIAgentRunner } = await import(
      pathToFileURL(require.resolve('@pikku/ai-vercel')).href
    ))
    ;({ createOpenAICompatible } = await import(
      pathToFileURL(require.resolve('@ai-sdk/openai-compatible')).href
    ))
  } catch (error) {
    logger.warn(
      `pikku dev: AI provider env is set but the AI SDK packages could not be loaded (install @pikku/ai-vercel, @ai-sdk/openai-compatible, and ai) — AI agents disabled: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return undefined
  }

  const buildProviders = (key: string): Record<string, unknown> => {
    const provider = createOpenAICompatible({
      name: 'pikku-dev',
      baseURL,
      apiKey: key,
    })
    return Object.fromEntries(
      PROXY_PROVIDER_NAMES.map((name) => [name, provider])
    )
  }

  logger.info(`pikku dev: AI agent runner wired to ${baseURL}`)
  return new VercelAIAgentRunner(buildProviders(apiKey), buildProviders)
}
