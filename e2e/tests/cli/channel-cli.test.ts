/**
 * A CLI whose commands live on the server, driven over a websocket.
 *
 * What is under test is the shape, not any one command: sign in, open a socket,
 * send argv the client never parses, and let the server call back down it. That
 * round trip needs a real server, which is why this is not a scenario.
 */
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'

import { CorePikkuWebsocket } from '@pikku/websocket'
import { executeRawCLIViaChannel } from '@pikku/core/cli/channel'
import type { ApprovalRequester, Capabilities } from '@pikku/core/channel'

import { startBackend } from '../../bin/backend-harness.js'
import { personaConfigs } from '../../.pikku/workflow/pikku-personas.gen.js'

let server: Awaited<ReturnType<typeof startBackend>>
let apiUrl: string
let token: string

/**
 * The client owns no commands, but still has to prove who it is before the
 * server will run any.
 */
const signIn = async (email: string, name: string): Promise<string> => {
  const res = await fetch(`${apiUrl}/api/auth/sign-in/actor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: apiUrl },
    body: JSON.stringify({
      email,
      name,
      secret: process.env.SCENARIO_ACTOR_SECRET,
    }),
  })
  assert.ok(res.ok, `actor sign-in failed: ${res.status}`)

  const bearer = res.headers.get('set-auth-token')
  assert.ok(bearer, 'expected better-auth to issue a bearer token')
  return bearer
}

interface RunResult {
  exitCode: number
  /** Everything the renderer was handed, in the order it arrived. */
  output: unknown[]
}

/**
 * Runs one command over its own connection. `capabilities` is what this
 * "machine" agrees to answer; `approve` stands in for the person at the
 * terminal, and omitting it is what a non-interactive run gets.
 */
const runCommand = async (
  args: string[],
  {
    authToken = token,
    capabilities = {},
    approve,
  }: {
    authToken?: string | null
    capabilities?: Capabilities
    approve?: ApprovalRequester
  } = {}
): Promise<RunResult> => {
  const wsUrl = `${apiUrl.replace(/^http/, 'ws')}/cli/release`
  const ws = new WebSocket(
    wsUrl,
    authToken
      ? { headers: { authorization: `Bearer ${authToken}` } }
      : undefined
  ) as unknown as globalThis.WebSocket

  const output: unknown[] = []

  const exitCode = await executeRawCLIViaChannel({
    pikkuWS: new CorePikkuWebsocket(ws),
    args,
    capabilities,
    approve,
    defaultRenderer: (_services, data) => {
      output.push(data)
    },
  })

  return { exitCode, output }
}

describe('CLI over a channel', () => {
  before(async () => {
    server = await startBackend()
    await server.waitUntilReady()
    apiUrl = server.apiUrl
    token = await signIn(personaConfigs.admin.email, personaConfigs.admin.name)
  })

  after(async () => {
    // Awaited: `stop` tears the dev server down asynchronously, and returning
    // before it finishes can leave the port held against the next run.
    await server?.stop()
  })

  test('a signed-in connection runs a command the client never parsed', async () => {
    const { exitCode, output } = await runCommand(['status'])

    assert.equal(exitCode, 0)
    assert.equal(output.length, 1)
    const status = output[0] as { userId?: string; ready?: boolean }
    assert.equal(status.ready, true)
    assert.ok(status.userId, 'the command ran as the signed-in user')
  })

  test('an unauthenticated connection cannot run anything', async () => {
    const { exitCode, output } = await runCommand(['status'], {
      authToken: null,
    })

    assert.notEqual(exitCode, 0, 'an unauthorized run must not report success')
    assert.deepEqual(
      output,
      [],
      'no command output should reach an unauthenticated caller'
    )
  })

  test('the server calls back into the client mid-command', async () => {
    const asked: unknown[] = []

    const { exitCode, output } = await runCommand(
      ['publish', '--tag', 'beta'],
      {
        capabilities: {
          // No server-chosen argument and no effect, so: classified safe.
          localCheckout: {
            execute: (data) => {
              asked.push(data)
              return { sha: 'c0ffee1234567890', branch: 'main' }
            },
            needsApproval: false,
          },
        },
      }
    )

    assert.equal(exitCode, 0)
    assert.equal(asked.length, 1, 'the server asked the client exactly once')

    // Progress arrives while the command is still running, and the second
    // frame proves the callback resolved before the command finished.
    assert.deepEqual(output[0], { step: 'checking working tree' })
    assert.deepEqual(output[1], { step: 'publishing c0ffee1' })
    assert.deepEqual(output[2], {
      publishedSha: 'c0ffee1234567890',
      branch: 'main',
      tag: 'beta',
    })
  })

  test('a capability answering with the wrong shape fails the command', async () => {
    // The client is the untrusted end. Version drift produces this as readily
    // as a hostile client does, and either way the command must not carry on
    // with a value it only assumed was a string.
    const { exitCode, output } = await runCommand(['publish'], {
      capabilities: {
        localCheckout: {
          execute: () => ({ sha: null, branch: ['main'] }),
          needsApproval: false,
        },
      },
    })

    assert.notEqual(exitCode, 0)
    assert.deepEqual(
      output.filter((frame: any) => frame?.publishedSha),
      [],
      'the command must not produce a result from an unchecked answer'
    )
  })

  test('an unclassified capability is put to the user before it runs', async () => {
    const asked: Array<{ funcName: string; description?: string }> = []

    // A bare function, the way anyone writes one first. The map says it *can*
    // run; approval decides whether this call *should*.
    const { exitCode, output } = await runCommand(
      ['publish', '--tag', 'beta'],
      {
        capabilities: {
          localCheckout: () => ({ sha: 'c0ffee1234567890', branch: 'main' }),
        },
        approve: (request) => {
          asked.push(request)
          return true
        },
      }
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(
      asked.map(({ funcName }) => funcName),
      ['localCheckout'],
      'the user was asked before the capability ran'
    )
    assert.deepEqual(output[2], {
      publishedSha: 'c0ffee1234567890',
      branch: 'main',
      tag: 'beta',
    })
  })

  test('a refused capability fails the command rather than hanging', async () => {
    let executed = false
    const { exitCode } = await runCommand(['publish'], {
      capabilities: {
        localCheckout: () => {
          executed = true
          return { sha: 'c0ffee1234567890', branch: 'main' }
        },
      },
      approve: () => false,
    })

    // The exit code alone would pass even if the capability had already run and
    // the refusal only failed the command afterwards.
    assert.equal(executed, false, 'a refused capability must not have run')

    // A refusal is an answer: the command fails on it rather than waiting out
    // a timeout for a decision already made.
    assert.notEqual(exitCode, 0)
  })

  test('with nobody to ask, an unclassified capability is refused', async () => {
    // The CI case: it must fail rather than proceed as though someone said yes.
    let executed = false
    const { exitCode } = await runCommand(['publish'], {
      capabilities: {
        localCheckout: () => {
          executed = true
          return { sha: 'c0ffee1234567890', branch: 'main' }
        },
      },
    })

    assert.notEqual(exitCode, 0)
    assert.equal(executed, false, 'nobody to ask means it does not run')
  })

  test('a capability the client did not expose is refused, and the command fails', async () => {
    const { exitCode } = await runCommand(['publish'], { capabilities: {} })

    assert.notEqual(
      exitCode,
      0,
      'a refused callback must fail the command, not hang or pass'
    )
  })

  test('a failing command exits non-zero', async () => {
    const { exitCode } = await runCommand(['verify'])
    assert.equal(exitCode, 1)
  })

  test('help is served from the server, not the client', async () => {
    const { exitCode } = await runCommand(['--help'])
    assert.equal(exitCode, 0)
  })
})
