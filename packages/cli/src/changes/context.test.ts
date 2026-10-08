import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  changesContext,
  registerChangesBackend,
  resetChangesBackends,
} from './context.js'

const home = process.cwd()

before(async () => {
  const repo = await mkdtemp(join(tmpdir(), 'changes-seam-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  process.chdir(repo)
})
after(() => process.chdir(home))

const fake = (name: string) => ({ invoke: async () => name }) as any

describe('where the changes live', () => {
  beforeEach(resetChangesBackends)

  test('with no backend the local file is used', async () => {
    const ctx = await changesContext(undefined)
    assert.strictEqual(ctx.projectId, 'local')
    assert.match(ctx.storePath, /pikku-changes\.json$/)
  })

  test('a backend that does not claim the project leaves it local', async () => {
    registerChangesBackend(async () => null)
    assert.strictEqual((await changesContext(undefined, 'p1')).projectId, 'local')
  })

  test('the first backend to claim the project wins', async () => {
    registerChangesBackend(async () => null)
    registerChangesBackend(async () => ({ rpc: fake('first'), projectId: 'p1' }))
    registerChangesBackend(async () => ({ rpc: fake('second'), projectId: 'p2' }))
    const claimed = await changesContext(undefined, 'p1')
    assert.strictEqual(claimed.projectId, 'p1')
    assert.strictEqual(await claimed.rpc.invoke('listChanges' as any, {} as any), 'first')
    assert.match(claimed.storePath, /pikku-changes\.json$/)
  })

  test('the api url and project id are handed to the backend', async () => {
    let seen: unknown
    registerChangesBackend(async (options) => ((seen = options), null))
    await changesContext('https://x.test', 'p9')
    assert.deepStrictEqual(seen, { apiUrl: 'https://x.test', projectId: 'p9' })
  })

  test('a backend that fails fails the command, and the local file is not used', async () => {
    registerChangesBackend(async () => {
      throw new Error('backend says no')
    })
    await assert.rejects(changesContext(undefined), /backend says no/)
  })
})
