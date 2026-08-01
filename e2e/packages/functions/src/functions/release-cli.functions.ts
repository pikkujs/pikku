import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

/**
 * The commands behind the `release` CLI, which is served over a websocket
 * rather than run locally.
 *
 * They exist to exercise the construct rather than any product behaviour: a
 * signed-in connection, output streamed while the command is still running,
 * and a command that calls back into the machine that invoked it — the client
 * holds facts (its checkout, its working tree) the server cannot see.
 */

/**
 * Proves the connection is authenticated: the session was established during
 * the websocket upgrade, so reaching this at all means sign-in worked.
 */
export const releaseStatus = pikkuFunc<
  void,
  { userId: string | undefined; ready: boolean }
>({
  func: async (_services, _data, { session }) => ({
    userId: session.userId,
    ready: true,
  }),
})

/**
 * Streams progress, then asks the client for something only it knows before
 * finishing. `rpc.remote` resolves over the connection the command arrived on,
 * so it reaches a caller that has no address of its own.
 */
export const releasePublish = pikkuFunc<
  { tag?: string },
  { publishedSha: string; branch: string; tag: string }
>({
  func: async (_services, data, { cli, rpc }) => {
    await cli!.channel!.send({ step: 'checking working tree' })

    // A client capability is not one of this app's functions, so it is absent
    // from the generated RPC map by design — the name is resolved against the
    // allowlist the connected client passed in, not against anything here.
    const callClient = rpc!.remote as (
      name: string,
      data: unknown
    ) => Promise<unknown>
    const { sha, branch } = (await callClient('localCheckout', {})) as {
      sha: string
      branch: string
    }

    await cli!.channel!.send({ step: `publishing ${sha.slice(0, 7)}` })

    return { publishedSha: sha, branch, tag: data.tag ?? 'latest' }
  },
})

/**
 * Fails on purpose. The exit code is the assertion — a remote command that
 * fails has to be distinguishable from one that succeeded quietly.
 */
export const releaseVerify = pikkuSessionlessFunc<void, void>({
  auth: false,
  func: async () => {
    throw new Error('release verification failed: 2 checks red')
  },
})
