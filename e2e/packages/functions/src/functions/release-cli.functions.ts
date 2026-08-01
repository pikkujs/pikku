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
 * The contract for a capability that runs on the client, declared here as a
 * function so it is typed and schema'd like any other — `channel.remote`
 * resolves the name against this, and what the client answers is checked
 * against the schema generated from the return type below.
 *
 * The body is what happens if it is ever called locally, which would mean a
 * command asked the server for something only the client can know.
 */
export const localCheckout = pikkuSessionlessFunc<
  void,
  { sha: string; branch: string }
>({
  auth: false,
  func: async () => {
    throw new Error('localCheckout runs on the connected client')
  },
})

/**
 * Streams progress, then asks the client for something only it knows before
 * finishing. The call goes back out over the connection the command arrived
 * on, so it reaches a caller that has no address of its own.
 */
export const releasePublish = pikkuFunc<
  { tag?: string },
  { publishedSha: string; branch: string; tag: string }
>({
  func: async (_services, data, { cli }) => {
    await cli!.channel!.send({ step: 'checking working tree' })

    // Typed against the declared contract, and the answer is checked against
    // that contract's schema before it gets here — the client is the untrusted
    // end, so a client on an older build fails the call rather than this.
    const { sha, branch } = await cli!.channel!.remote('localCheckout')

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
