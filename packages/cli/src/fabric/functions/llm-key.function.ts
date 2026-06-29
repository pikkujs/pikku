import { z } from 'zod'
import { BadRequestError, UnauthorizedError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'

export const FabricLLMKeyInput = z.object({
  shell: z.boolean().optional(),
  env: z.boolean().optional(),
  json: z.boolean().optional(),
})

export const FabricLLMKeyOutput = z.object({
  proxyUrl: z.string(),
  apiKey: z.string(),
  format: z.enum(['text', 'env', 'shell', 'json']),
})

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export const FabricLLMKey = pikkuSessionlessFunc({
  description: 'Mint or reuse the current user Fabric AI gateway key.',
  input: FabricLLMKeyInput,
  output: FabricLLMKeyOutput,
  func: async (_services, { shell, env, json }) => {
    const selectedFormats = [shell, env, json].filter(Boolean).length
    if (selectedFormats > 1) {
      throw new BadRequestError(
        'Choose only one of `--shell`, `--env`, or `--json`.'
      )
    }

    const ctx = await resolveApiContext()
    if (!ctx.token) {
      throw new UnauthorizedError(
        'Not logged in. Run `pikku fabric login` first.'
      )
    }

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const result = await rpc.invoke('getDeveloperLiteLLMKey', {})
    const format: 'text' | 'env' | 'shell' | 'json' = shell
      ? 'shell'
      : env
        ? 'env'
        : json
          ? 'json'
          : 'text'

    return {
      proxyUrl: result.proxyUrl,
      apiKey: result.apiKey,
      format,
    }
  },
})

export const renderLLMKey = (
  _services: unknown,
  data: {
    proxyUrl: string
    apiKey: string
    format: 'text' | 'env' | 'shell' | 'json'
  }
): void => {
  if (data.format === 'json') {
    console.log(
      JSON.stringify(
        {
          proxyUrl: data.proxyUrl,
          apiKey: data.apiKey,
          openaiBaseUrl: data.proxyUrl,
          openaiApiKey: data.apiKey,
          litellmProxyUrl: data.proxyUrl,
          litellmApiKey: data.apiKey,
        },
        null,
        2
      )
    )
    return
  }

  const envLines = [
    `OPENAI_BASE_URL=${data.proxyUrl}`,
    `OPENAI_API_KEY=${data.apiKey}`,
    `LITELLM_PROXY_URL=${data.proxyUrl}`,
    `LITELLM_API_KEY=${data.apiKey}`,
  ]

  if (data.format === 'shell') {
    console.log(
      envLines
        .map((line) => {
          const [key, ...rest] = line.split('=')
          return `export ${key}=${shellEscape(rest.join('='))}`
        })
        .join('\n')
    )
    return
  }

  console.log(envLines.join('\n'))
}
