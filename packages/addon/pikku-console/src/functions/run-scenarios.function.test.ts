import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MissingScopeError } from '#pikku/addon/error'
import { verifyScopes } from '@pikku/core/scope'

import { runScenarios } from './run-scenarios.function.js'

/** A project whose `node_modules/.bin/pikku` logs the arguments and cwd it was started with. */
const project = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pikku-run-scenarios-')))
  const log = join(root, 'calls.log')
  writeFileSync(join(root, 'pikku.config.json'), '{}')
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
  writeFileSync(
    join(root, 'node_modules', '.bin', 'pikku'),
    `import { writeFileSync } from 'node:fs'\n` +
      `writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }))\n`
  )
  return {
    root,
    metaService: { basePath: join(root, '.pikku') },
    call: async (): Promise<{ args: string[]; cwd: string }> => {
      const deadline = Date.now() + 5000
      while (!existsSync(log) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20))
      }
      return JSON.parse(readFileSync(log, 'utf-8'))
    },
  }
}

const invoke = (services: unknown, input: unknown = {}) =>
  runScenarios.func(services as never, input as never, {} as never) as Promise<{
    runId: string
  }>

describe('runScenarios', () => {
  test('refuses to run without a configured meta service', async () => {
    await assert.rejects(invoke({}), /Meta service is not configured/)
  })

  test('starts `pikku scenario run` in the project under the run id it returns', async () => {
    const p = project()
    const { runId } = await invoke({
      metaService: p.metaService,
      variables: { get: async () => 'dev' },
    })
    const { args, cwd } = await p.call()

    assert.deepEqual(args, ['scenario', 'run', 'dev', '--run-id', runId])
    assert.equal(cwd, p.root)
  })

  test('narrows the run to the named scenarios, against the environment asked for', async () => {
    const p = project()
    const { runId } = await invoke(
      { metaService: p.metaService, variables: { get: async () => 'dev' } },
      { names: ['signUp', 'checkout'], environment: 'staging' }
    )
    const { args } = await p.call()

    assert.deepEqual(args, [
      'scenario',
      'run',
      'staging',
      '--run-id',
      runId,
      '--flows',
      'signUp,checkout',
    ])
  })

  test('falls back to the local environment when the server names none', async () => {
    const p = project()
    await invoke({
      metaService: p.metaService,
      variables: { get: async () => undefined },
    })
    const { args } = await p.call()
    assert.equal(args[2], 'local')
  })

  test('refuses a holder of only the scenarios read scope', () => {
    assert.throws(
      () =>
        verifyScopes(runScenarios.scopes, {
          userId: 'alice',
          scopes: ['pikku:console:scenarios:read'],
        }),
      MissingScopeError
    )
  })

  test('admits a holder of the scenarios run scope', () => {
    assert.doesNotThrow(() =>
      verifyScopes(runScenarios.scopes, {
        userId: 'root',
        scopes: ['pikku:console:scenarios:run'],
      })
    )
  })
})
