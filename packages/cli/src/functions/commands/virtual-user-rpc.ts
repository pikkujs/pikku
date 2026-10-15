import { pikkuSessionlessFunc } from '#pikku/function'
import { createHttpVirtualUsers } from '@pikku/core/virtual-user'
import { PikkuError } from '@pikku/core/errors'

import { resolveVirtualUsers } from '../../utils/resolve-virtual-users.js'
import {
  resolveVirtualUserCredentials,
  loadWiredVirtualUserSignIn,
} from '../../utils/virtual-user-credentials.js'
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

export const virtualUserRpc = pikkuSessionlessFunc<
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
    { rpc, as: virtualUserId, data, environment = 'local', apiUrl }
  ) => {
    const state = await getInspectorState(true, false, false, true)
    const virtualUsers = resolveVirtualUsers(
      state.virtualUsers?.definitions ?? [],
      config.scenarios?.emailDomain
    )
    const virtualUser = virtualUsers[virtualUserId]
    if (!virtualUser) {
      const known = Object.keys(virtualUsers)
      throw new PikkuError(
        `No virtual user '${virtualUserId}'.${known.length ? ` Declared: ${known.join(', ')}` : ' None are declared — add a defineVirtualUsers({ … }) call.'}`
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
    await loadWiredVirtualUserSignIn(state)
    const signedIn = createHttpVirtualUsers({
      apiUrl: env.apiUrl,
      variables,
      ...(await resolveVirtualUserCredentials(variables, 'an RPC call')),
      virtualUsers,
      signInPath: env.signInPath,
      sessionPath: env.sessionPath,
      rpcPath: env.rpcPath,
    })

    let res
    try {
      res = await signedIn[virtualUserId]!.invokeRaw(rpc, input)
    } catch (error) {
      if (unreachable(error)) {
        throw new PikkuError(
          `Nothing answered at ${env.apiUrl}. Start the server with \`pikku dev\`, or pass --api-url.`
        )
      }
      throw new PikkuError(
        `Could not sign in as '${virtualUserId}', so this says nothing about '${rpc}': ${(error as Error).message}`
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
        `'${virtualUserId}' (${virtualUser.roles.join(', ') || 'no roles'}) is not permitted to call '${rpc}': ${res.status}\n${res.serialized}\n`
      )
      return
    }
    if (!res.ok) process.exitCode = 1
    process.stdout.write(
      `${res.status}\n${typeof res.body === 'string' || res.body === undefined ? res.serialized : JSON.stringify(res.body, null, 2)}\n`
    )
  },
})
