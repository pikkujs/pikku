import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as changesLib from '../lib/changes.js'

/**
 * The commands themselves, not the helpers they call: what reaches
 * `rpc.invoke` is the whole of what fabric-api sees, so the defaults each
 * command fills in — the claimant, the lease, the git metadata, the encoded
 * image — are only ever true at this boundary.
 *
 * `changesContext` and the git probes are replaced because both read the
 * machine: an auth token from `~/.fabric/auth.json` and whatever branch the
 * checkout running the suite happens to be on.
 */
const invoked: { name: string; data: any }[] = []

let projectId: string | null = 'proj_linked'
let git: { repo: boolean; branch: string; sha: string } = {
  repo: true,
  branch: 'fix/1677-changes',
  sha: 'abc1234def5678',
}

mock.module('../lib/changes.js', () => ({
  ...changesLib,
  changesContext: async (_apiUrl?: string, projectIdOverride?: string) => ({
    rpc: {
      invoke: async (name: string, data: unknown) => {
        invoked.push({ name, data })
        return { ok: true }
      },
    },
    projectId: projectIdOverride ?? projectId,
  }),
}))

mock.module('../lib/git.js', () => ({
  isGitRepo: async () => git.repo,
  currentBranch: async () => git.branch,
  headSha: async () => git.sha,
}))

const { FabricChangesClaim } = await import('./changes-claim.function.js')
const { FabricChangesAsk, FabricChangesAskInput } =
  await import('./changes-ask.function.js')
const { FabricChangesDone } = await import('./changes-done.function.js')
const { FabricChangesShot } = await import('./changes-shot.function.js')

const sent = async (run: () => Promise<unknown>) => {
  invoked.length = 0
  await run()
  assert.strictEqual(invoked.length, 1, 'expected exactly one RPC')
  return invoked[0]!
}

describe('changes claim', () => {
  test('sends the linked project, a normalized id list and the defaults', async () => {
    const { name, data } = await sent(() =>
      FabricChangesClaim.func(
        {} as any,
        {
          changeIds: ['chg_1, chg_2', ' chg_3 '],
        } as any
      )
    )
    assert.strictEqual(name, 'claimChanges')
    assert.strictEqual(data.projectId, 'proj_linked')
    assert.deepStrictEqual(data.changeIds, ['chg_1', 'chg_2', 'chg_3'])
    assert.strictEqual(data.claimedBy, 'pikku-cli')
    assert.strictEqual(data.leaseMinutes, 30)
  })

  test('--project-id wins over the linked checkout', async () => {
    const { data } = await sent(() =>
      FabricChangesClaim.func({} as any, { projectId: 'proj_flag' } as any)
    )
    assert.strictEqual(data.projectId, 'proj_flag')
  })

  test('refuses to claim when nothing says which project', async () => {
    projectId = null
    try {
      await assert.rejects(
        FabricChangesClaim.func({} as any, {} as any),
        /No fabric project/
      )
    } finally {
      projectId = 'proj_linked'
    }
  })
})

describe('changes ask', () => {
  test('sends the question with a default author', async () => {
    const { name, data } = await sent(() =>
      FabricChangesAsk.func(
        {} as any,
        {
          changeId: 'chg_1',
          question: 'Which total?',
        } as any
      )
    )
    assert.strictEqual(name, 'askChangeQuestion')
    assert.deepStrictEqual(data, {
      changeId: 'chg_1',
      question: 'Which total?',
      authorName: 'pikku-cli',
    })
  })

  test('a blank question never reaches the api', () => {
    const parsed = FabricChangesAskInput.safeParse({
      changeId: 'chg_1',
      question: '   ',
    })
    assert.strictEqual(parsed.success, false)
  })
})

describe('changes done', () => {
  test('reads the branch and commit off the checkout', async () => {
    const { name, data } = await sent(() =>
      FabricChangesDone.func({} as any, { changeId: 'chg_1' } as any)
    )
    assert.strictEqual(name, 'completeChange')
    assert.strictEqual(data.branch, 'fix/1677-changes')
    assert.strictEqual(data.headCommit, 'abc1234def5678')
  })

  test('what the caller passed is never overwritten by git', async () => {
    const { data } = await sent(() =>
      FabricChangesDone.func(
        {} as any,
        {
          changeId: 'chg_1',
          branch: 'release/1.0',
          headCommit: 'deadbee',
        } as any
      )
    )
    assert.strictEqual(data.branch, 'release/1.0')
    assert.strictEqual(data.headCommit, 'deadbee')
  })

  test('a detached checkout records the sha and no branch', async () => {
    git = { repo: true, branch: 'HEAD', sha: 'abc1234def5678' }
    try {
      const { data } = await sent(() =>
        FabricChangesDone.func({} as any, { changeId: 'chg_1' } as any)
      )
      assert.strictEqual(data.branch, undefined)
      assert.strictEqual(data.headCommit, 'abc1234def5678')
    } finally {
      git = { repo: true, branch: 'fix/1677-changes', sha: 'abc1234def5678' }
    }
  })

  test('outside a repo it sends neither, rather than guessing', async () => {
    git = { repo: false, branch: '', sha: '' }
    try {
      const { data } = await sent(() =>
        FabricChangesDone.func({} as any, { changeId: 'chg_1' } as any)
      )
      assert.strictEqual(data.branch, undefined)
      assert.strictEqual(data.headCommit, undefined)
    } finally {
      git = { repo: true, branch: 'fix/1677-changes', sha: 'abc1234def5678' }
    }
  })
})

describe('changes shot', () => {
  const image = async (name: string, bytes: Buffer) => {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-shot-'))
    const path = join(dir, name)
    await writeFile(path, bytes)
    return path
  }

  test('reads the file, encodes it, and infers the type from the name', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    const path = await image('variant.PNG', bytes)
    const { name, data } = await sent(() =>
      FabricChangesShot.func(
        {} as any,
        {
          changeId: 'chg_1',
          label: 'option a',
          image: path,
        } as any
      )
    )
    assert.strictEqual(name, 'attachChangeShot')
    assert.strictEqual(data.contentType, 'image/png')
    assert.strictEqual(data.imageBase64, bytes.toString('base64'))
    assert.strictEqual(data.kind, 'option')
  })

  test('--content-type wins over the extension', async () => {
    const path = await image('variant.png', Buffer.from([1, 2, 3]))
    const { data } = await sent(() =>
      FabricChangesShot.func(
        {} as any,
        {
          changeId: 'chg_1',
          label: 'evidence',
          image: path,
          contentType: 'image/webp',
          kind: 'evidence',
        } as any
      )
    )
    assert.strictEqual(data.contentType, 'image/webp')
    assert.strictEqual(data.kind, 'evidence')
  })

  test('--image-base64 still goes straight through', async () => {
    const { data } = await sent(() =>
      FabricChangesShot.func(
        {} as any,
        {
          changeId: 'chg_1',
          label: 'option a',
          imageBase64: 'AAEC',
        } as any
      )
    )
    assert.strictEqual(data.imageBase64, 'AAEC')
    assert.strictEqual(data.contentType, 'image/png')
  })

  test('a name that implies nothing is refused before anything is read', async () => {
    const path = await image('variant.gif', Buffer.from([1]))
    invoked.length = 0
    await assert.rejects(
      FabricChangesShot.func(
        {} as any,
        {
          changeId: 'chg_1',
          label: 'option a',
          image: path,
        } as any
      ),
      /pass --content-type/
    )
    assert.strictEqual(invoked.length, 0)
  })

  test('neither --image nor --image-base64 is refused', async () => {
    await assert.rejects(
      FabricChangesShot.func(
        {} as any,
        {
          changeId: 'chg_1',
          label: 'option a',
        } as any
      ),
      /--image <path> or --image-base64/
    )
  })
})
