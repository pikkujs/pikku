import { createRequire } from 'module'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { Logger, VariablesService } from '@pikku/core/services'
import type { AIAgentRunnerService } from '@pikku/core/services'

/**
 * Build the AI agent runner for `pikku dev` from env.
 *
 * Deployed agent units get their runner wired by the bundler; the dev server
 * has no equivalent, so agents 503 with AIProviderNotConfiguredError unless we
 * construct one here. When an OpenAI-compatible base URL + key are present
 * (fabric injects LITELLM_PROXY_URL/LITELLM_API_KEY; the standard OPENAI_*
 * vars are also honored) we point one provider at it and register it under
 * `'*'`, so every provider prefix resolves to it. Returns undefined when no AI
 * env is configured (agents stay disabled, with the clear downstream error) or
 * when the AI SDK packages aren't installed in the project.
 *
 * Audio does not work here: `@ai-sdk/openai-compatible` exposes only
 * language/embedding/image models, so a voice agent under `pikku dev` throws
 * `Provider does not support transcription models`. Fixing that means the full
 * `@ai-sdk/openai` provider, which assumes OpenAI's own request specifics — a
 * bad default for a path whose entire purpose is fronting arbitrary gateways.
 * If it becomes worth it, delegate just `transcription`/`speech` to the full
 * provider and leave everything else on this one.
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

  // One provider under '*', so every prefix a model might name resolves to the
  // proxy — including ones nobody thought to list. This was a hardcoded array
  // of seven names, which silently excluded everything else.
  //
  // `supportsStructuredOutputs` defaults to false, and the default fails in the
  // worst available way: an `outputSchema` is dropped, the call degrades to
  // bare `json_object`, and the model returns well-formed JSON with whatever
  // keys it felt like. Nothing errors — the caller reads `undefined` off every
  // field it asked for and behaves as though the model said nothing. Anything
  // fronting this URL that is worth calling speaks `json_schema`; the ones that
  // do not now fail loudly on the first schema'd call, which is the outcome we
  // want over silently ignoring the schema.
  const buildProviders = (key: string): Record<string, unknown> => ({
    '*': createOpenAICompatible({
      name: 'pikku-dev',
      baseURL,
      apiKey: key,
      supportsStructuredOutputs: true,
    }),
  })

  logger.info(`pikku dev: AI agent runner wired to ${baseURL}`)
  return new VercelAIAgentRunner(buildProviders(apiKey), buildProviders)
}
