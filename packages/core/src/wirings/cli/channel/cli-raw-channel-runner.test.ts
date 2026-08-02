import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'

import { handleRawCLI } from './cli-raw-channel-runner.js'
import { pikkuState, resetPikkuState } from '../../../pikku-state.js'
import { addFunction } from '../../../function/function-runner.js'
import {
  ChannelDeploymentService,
  createChannelRPCResponder,
  isChannelRPCRequest,
} from '../../channel/channel-rpc.js'

/**
 * Registers a one-command CLI program whose function body is supplied by the
 * test, standing in for what the inspector would generate.
 */
const wireTestCLI = (func: (services: any, data: any, wire: any) => any) => {
  pikkuState(null, 'cli', 'meta', {
    programs: {
      fabric: {
        program: 'fabric',
        commands: {
          deploy: {
            command: 'deploy',
            pikkuFuncId: 'deployFunc',
            positionals: [],
            options: {},
          },
        },
        options: {},
      },
    },
    renderers: {},
  })

  pikkuState(null, 'cli', 'programs', {
    fabric: { defaultRenderer: undefined, middleware: [], renderers: {} },
  })

  pikkuState(null, 'function', 'meta', {
    deployFunc: {
      pikkuFuncId: 'deployFunc',
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    },
  })

  addFunction('deployFunc', { func, auth: false })
}

describe('handleRawCLI', () => {
  let singletonServices: any

  beforeEach(() => {
    resetPikkuState()
    singletonServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    }
  })

  afterEach(() => resetPikkuState())

  test('streams progressive output to the sink instead of the server stdout', async () => {
    const streamed: unknown[] = []

    wireTestCLI(async (_services, _data, { cli }: any) => {
      await cli.channel.send({ phase: 'building' })
      await cli.channel.send({ phase: 'deploying' })
      return { url: 'https://example.com' }
    })

    const result = await handleRawCLI({
      programName: 'fabric',
      args: ['deploy'],
      singletonServices,
      onOutput: (data) => void streamed.push(data),
    })

    assert.deepEqual(streamed, [{ phase: 'building' }, { phase: 'deploying' }])
    assert.deepEqual(result.result, { url: 'https://example.com' })
    assert.equal(result.exitCode, 0)
    assert.equal(result.commandId, 'deploy')
  })

  test('reports a non-zero exit code when the command throws', async () => {
    wireTestCLI(() => {
      throw new Error('deploy plan is red')
    })

    const result = await handleRawCLI({
      programName: 'fabric',
      args: ['deploy'],
      singletonServices,
    })

    assert.equal(result.exitCode, 1)
    assert.match(result.error!, /deploy plan is red/)
  })

  test('exits 0 on help and 1 on an unknown command', async () => {
    wireTestCLI(() => ({}))

    const help = await handleRawCLI({
      programName: 'fabric',
      args: ['--help'],
      singletonServices,
    })
    assert.equal(help.exitCode, 0)
    assert.ok(help.help)

    const unknown = await handleRawCLI({
      programName: 'fabric',
      args: ['not-a-command'],
      singletonServices,
    })
    assert.equal(unknown.exitCode, 1)
  })

  test('a server-side command can call back into the client mid-run', async () => {
    const streamed: unknown[] = []

    // The "client": answers capability requests off the same socket. Reading a
    // git sha takes no arguments and changes nothing, so it is classified safe
    // and runs without anyone being asked.
    const respond = createChannelRPCResponder({
      capabilities: {
        gitHead: {
          execute: async () => ({ sha: 'deadbeef' }),
          needsApproval: false,
        },
      },
      send: (data) => deployment.handleResponse(data),
    })

    const deployment = new ChannelDeploymentService((data) => {
      if (isChannelRPCRequest(data)) {
        void respond(data)
      }
    })

    singletonServices.deploymentService = deployment

    wireTestCLI(async (_services, _data, { cli, rpc }: any) => {
      const { sha } = (await rpc.remote('gitHead', {})) as { sha: string }
      await cli.channel.send({ phase: `resolved ${sha}` })
      return { deployed: sha }
    })

    const result = await handleRawCLI({
      programName: 'fabric',
      args: ['deploy'],
      singletonServices,
      onOutput: (data) => void streamed.push(data),
    })

    assert.equal(result.exitCode, 0, result.error)
    // `onOutput` carries progressive output only. The result is returned to
    // the caller, which owns how it is delivered — emitting it here too would
    // send it to the client twice.
    assert.deepEqual(streamed, [{ phase: 'resolved deadbeef' }])
    assert.deepEqual(result.result, { deployed: 'deadbeef' })
  })
})
