import { createRequire } from 'module'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { Logger } from '@pikku/core/services'
import type { VariablesService } from '@pikku/core/services'
import type { AgentRunnerService } from '@pikku/core/services'

/**
 * Build the AI agent runner for `pikku dev` from env.
 *
 * Deployed agent units get their runner wired by the bundler; the dev server
 * has no equivalent, so agents 503 with AIProviderNotConfiguredError unless we
 * construct one here. When an OpenAI-compatible base URL + key are present
 * (fabric injects LITELLM_PROXY_URL/LITELLM_API_KEY; the standard OPENAI_*
 * vars are also honored) we point one provider at it and register it under
 * `'*'`, so every provider prefix resolves to it. The CLI ships the SDK rather
 * than asking the project for it — behind a proxy one openai-compatible
 * provider answers for `openai/…`, `anthropic/…` and `google/…` alike, so there
 * was never a per-vendor package worth making somebody install. The project's
 * own copies still win when it has them. Returns undefined when no AI env is
 * configured (agents stay disabled, with the clear downstream error) or when
 * the SDK packages cannot be loaded from either place.
 *
 * Audio does not work here: `@ai-sdk/openai-compatible` exposes only
 * language/embedding/image models, so a voice agent under `pikku dev` throws
 * `Provider does not support transcription models`. Fixing that means the full
 * `@ai-sdk/openai` provider, which assumes OpenAI's own request specifics — a
 * bad default for a path whose entire purpose is fronting arbitrary gateways.
 * If it becomes worth it, delegate just `transcription`/`speech` to the full
 * provider and leave everything else on this one.
 */
export async function createDevAgentRunner({
  logger,
  projectRoot,
  variables,
}: {
  logger: Logger
  projectRoot: string
  variables: VariablesService
}): Promise<AgentRunnerService | undefined> {
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

  // The project's own copies win, so an app that pins an `ai` version gets a
  // runner built from that one rather than a second copy alongside it. The
  // CLI's are the fallback: this function exists for projects that have not
  // installed an AI SDK at all, and behind a proxy a single openai-compatible
  // provider reaches every model, so making someone add three packages before
  // agents work in dev buys nothing.
  const fromProject = createRequire(
    pathToFileURL(join(projectRoot, 'package.json')).href
  )
  //
  // Both come from the same place or neither does. A provider built against one
  // copy of `@ai-sdk/provider` handed to a runner built against another is the
  // one combination that fails at call time rather than at load time, with an
  // error about the model spec that names neither package.
  const PAIR = ['@pikku/ai-vercel', '@ai-sdk/openai-compatible'] as const

  // `projectRoot` is the root package.json, and under an isolated node_modules
  // layout (bun, pnpm) that resolves only what the *root* declares — a monorepo
  // that installed the pair in the workspace using it still misses here. Say so
  // rather than silently swapping in our own copies: the failure that follows
  // names neither package, so the log line is the only thing connecting it back.
  const resolveFromProject = (name: string) => {
    try {
      return pathToFileURL(fromProject.resolve(name)).href
    } catch {
      return undefined
    }
  }

  const loadPair = async () => {
    const project = PAIR.map(resolveFromProject)
    const complete = project.every(Boolean)
    if (!complete && project.some(Boolean)) {
      const missing = PAIR.filter((_, index) => !project[index])
      logger.warn(
        `pikku dev: ${missing.join(' and ')} could not be resolved from ${join(
          projectRoot,
          'package.json'
        )}, so the CLI's own AI SDK copies are being used for all of ${PAIR.join(
          ' and '
        )}. In a monorepo with an isolated node_modules layout, declare them at the root.`
      )
    }
    const [runner, provider] = complete ? (project as string[]) : PAIR
    return Promise.all([import(runner!), import(provider!)] as const).then(
      (modules) =>
        [...modules, complete ? (project as string[]) : undefined] as const
    )
  }

  // The runner and the provider each hold their own `@ai-sdk/provider`. When the
  // majors differ the provider builds a model whose `specificationVersion` the
  // runner's `ai` refuses, and the throw arrives at the first model call reading
  // `Unsupported model version …` — naming the model and the gateway, but not
  // the two packages that actually disagree. Check it here instead, where both
  // paths are in hand.
  const providerSpecVersion = (from: string | undefined) => {
    if (!from) {
      return undefined
    }
    try {
      return createRequire(from)('@ai-sdk/provider/package.json')
        .version as string
    } catch {
      return undefined
    }
  }

  let VercelAgentRunner: any
  let createOpenAICompatible: any
  try {
    const [runnerModule, providerModule, resolved] = await loadPair()
    ;({ VercelAgentRunner } = runnerModule)
    ;({ createOpenAICompatible } = providerModule)

    const [runnerSpec, providerSpec] = (resolved ?? []).map(providerSpecVersion)
    if (
      runnerSpec &&
      providerSpec &&
      runnerSpec.split('.')[0] !== providerSpec.split('.')[0]
    ) {
      logger.error(
        `pikku dev: AI agents disabled — @pikku/ai-vercel resolves @ai-sdk/provider@${runnerSpec} but @ai-sdk/openai-compatible resolves @ai-sdk/provider@${providerSpec}. Those majors are incompatible: the provider builds models the runner's \`ai\` refuses. @ai-sdk/openai-compatible publishes one line per major of \`ai\` (npm dist-tags ai-v5/ai-v6/latest) — install the line matching the \`ai\` your @pikku/ai-vercel peer-depends on.`
      )
      return undefined
    }
  } catch (error) {
    logger.warn(
      `pikku dev: AI provider env is set but the AI SDK packages could not be loaded — AI agents disabled: ${
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
  return new VercelAgentRunner(buildProviders(apiKey), buildProviders)
}
