import { pikkuSessionlessFunc } from '#pikku/function'
import { createHttpPersonas } from '@pikku/core/persona'
import { PikkuError } from '@pikku/core/errors'

import { resolvePersonas } from '../../utils/resolve-personas.js'
import { resolvePersonaCredentials } from '../../utils/persona-credentials.js'
import { resolveEnvironment } from './environment.js'

const unreachable = (error: unknown): boolean => {
  const cause = (error as { cause?: { code?: string } })?.cause
  return (
    ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(cause?.code ?? '') ||
    /fetch failed|Unable to connect/i.test(String((error as Error)?.message))
  )
}

const notFound = (status: number, serialized: string): boolean =>
  status === 404 || serialized.includes('RPC function not found')

export const personaRpc = pikkuSessionlessFunc<
  {
    rpc: string
    as: string
    data?: string
    environment?: string
    apiUrl?: string
  },
  void
>({
  func: async (
    { config, getInspectorState, variables },
    { rpc, as: personaId, data, environment = 'local', apiUrl }
  ) => {
    const state = await getInspectorState(true, false, false, true)
    const personas = resolvePersonas(
      state.personas?.definitions ?? [],
      config.scenarios?.emailDomain
    )
    const persona = personas[personaId]
    if (!persona) {
      const known = Object.keys(personas)
      throw new PikkuError(
        `No persona '${personaId}'.${known.length ? ` Declared: ${known.join(', ')}` : ' None are declared — add a definePersonas({ … }) call.'}`
      )
    }

    const exposed = state.rpc?.exposedMeta ?? {}
    if (!exposed[rpc]) {
      const internal = state.rpc?.internalMeta?.[rpc]
      const near = Object.keys(exposed)
        .filter((name) => name.toLowerCase().includes(rpc.toLowerCase()))
        .slice(0, 5)
      throw new PikkuError(
        internal
          ? `'${rpc}' is declared but not exposed, so no RPC route reaches it. Add \`expose: true\` to the function.`
          : `No exposed RPC '${rpc}' in this project.${near.length ? ` Did you mean: ${near.join(', ')}?` : ''}`
      )
    }

    let input: unknown = {}
    if (data !== undefined) {
      try {
        input = JSON.parse(data)
      } catch {
        throw new PikkuError(`--data is not JSON: ${data}`)
      }
    }

    const env = resolveEnvironment({
      environment,
      environments: config.environments ?? {},
      apiUrl,
    })
    const signedIn = createHttpPersonas({
      apiUrl: env.apiUrl,
      ...(await resolvePersonaCredentials(variables, 'an RPC call')),
      personas,
      signInPath: env.signInPath,
      sessionPath: env.sessionPath,
      rpcPath: env.rpcPath,
    })

    let res
    try {
      res = await signedIn[personaId]!.invokeRaw(rpc, input)
    } catch (error) {
      if (unreachable(error)) {
        throw new PikkuError(
          `Nothing answered at ${env.apiUrl}. Start the server with \`pikku dev\`, or pass --api-url.`
        )
      }
      throw new PikkuError(
        `Could not sign in as '${personaId}', so this says nothing about '${rpc}': ${(error as Error).message}`
      )
    }

    if (notFound(res.status, res.serialized)) {
      throw new PikkuError(
        `'${rpc}' is in this project but the server at ${env.apiUrl} does not have it. The dev server is stale: restart \`pikku dev\`.`
      )
    }
    if (res.status === 401 || res.status === 403) {
      process.exitCode = 1
      process.stdout.write(
        `'${personaId}' (${persona.roles.join(', ') || 'no roles'}) is not permitted to call '${rpc}': ${res.status}\n${res.serialized}\n`
      )
      return
    }
    if (!res.ok) process.exitCode = 1
    process.stdout.write(
      `${res.status}\n${typeof res.body === 'string' || res.body === undefined ? res.serialized : JSON.stringify(res.body, null, 2)}\n`
    )
  },
})
