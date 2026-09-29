import { after, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as changesLib from '../lib/changes.js'
import * as gitLib from '../../utils/git.js'

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

let respond: (name: string, data: any) => unknown = () => ({ ok: true })

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
        return respond(name, data)
      },
    },
    projectId: projectIdOverride ?? projectId,
  }),
}))

/**
 * The real probes, snapshotted before the mock takes their place.
 *
 * `mock.module` replaces the module for the whole process and is never undone,
 * so this mock outlives the file that installs it: every test file that runs
 * after this one gets it too. That makes both halves below load-bearing. The
 * spread keeps the exports this file does not fake — `isTracked` among them —
 * pointing at the real implementations instead of becoming `undefined`, and
 * `gitOverride` hands the real probes back once these tests are done. Without
 * the second part `isGitRepo` keeps answering `git.repo`, left `true` by the
 * last test here, and a later suite asking about a bare temporary directory is
 * told it is a git repository.
 */
const realGit = { ...gitLib }

/** Whether the faked answers above are still in force. */
let gitOverride = true

mock.module('../../utils/git.js', () => ({
  ...realGit,
  isGitRepo: async (cwd?: string) =>
    gitOverride ? git.repo : realGit.isGitRepo(cwd),
  currentBranch: async (cwd?: string) =>
    gitOverride ? git.branch : realGit.currentBranch(cwd),
  headSha: async (cwd?: string) =>
    gitOverride ? git.sha : realGit.headSha(cwd),
}))

after(() => {
  gitOverride = false
})

const { FabricChangesClaim } = await import('./changes-claim.function.js')
const { FabricChangesAsk, FabricChangesAskInput } =
  await import('./changes-ask.function.js')
const { FabricChangesDone } = await import('./changes-done.function.js')
const { FabricChangesShot } = await import('./changes-shot.function.js')
const { FabricChangesFile } = await import('./changes-file.function.js')

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

describe('changes claim, refused', () => {
  const HELD = '5f0f6a4e-0000-4000-8000-000000000001'
  const TAKEN = '5f0f6a4e-0000-4000-8000-000000000002'

  test('a 409 names why each item could not be taken', async () => {
    respond = (name) => {
      if (name === 'claimChanges')
        throw Object.assign(new Error('no claimable items in that set'), {
          status: 409,
        })
      return {
        changes: [
          {
            changeId: HELD,
            shortId: '3',
            status: 'open',
            held: true,
            groupId: null,
            createdAt: new Date(Date.now() - 20_000).toISOString(),
          },
          {
            changeId: TAKEN,
            shortId: '4',
            status: 'claimed',
            held: false,
            groupId: 'grp_1',
            createdAt: new Date(Date.now() - 600_000).toISOString(),
          },
        ],
        groups: [
          {
            groupId: 'grp_1',
            claimedBy: 'other-agent',
            claimExpiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
          },
        ],
      }
    }
    try {
      await assert.rejects(
        FabricChangesClaim.func({} as any, { changeIds: [HELD, TAKEN] } as any),
        (error: Error) =>
          /#3: still held for the person filing it \(filed 2\ds ago\)/.test(
            error.message
          ) &&
          /#4: claimed, claimed by other-agent for 20m more/.test(
            error.message
          ) &&
          /changes next --claim/.test(error.message)
      )
    } finally {
      respond = () => ({ ok: true })
    }
  })

  test('short ids are resolved before claiming', async () => {
    respond = (name) =>
      name === 'listChanges'
        ? { changes: [{ changeId: HELD, shortId: '3' }], groups: [] }
        : { ok: true }
    try {
      invoked.length = 0
      await FabricChangesClaim.func({} as any, { changeIds: ['#3'] } as any)
      const claim = invoked.find((call) => call.name === 'claimChanges')!
      assert.deepStrictEqual(claim.data.changeIds, [HELD])
    } finally {
      respond = () => ({ ok: true })
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

describe('changes file', () => {
  test('sends the named stage and drops what was not given', async () => {
    const { name, data } = await sent(() =>
      FabricChangesFile.func(
        {} as any,
        {
          stageId: 'stage_1',
          title: 'Drop the days-free figure',
          route: '/availability',
        } as any
      )
    )
    assert.strictEqual(name, 'createChange')
    assert.strictEqual(data.stageId, 'stage_1')
    assert.strictEqual(data.route, '/availability')
    assert.strictEqual(data.body, undefined)
  })

  test('reads the body from a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-file-'))
    const path = join(dir, 'body.md')
    await writeFile(path, '  one\n\ntwo  \n')
    const { data } = await sent(() =>
      FabricChangesFile.func(
        {} as any,
        { stageId: 'stage_1', title: 'Two paragraphs', bodyFile: path } as any
      )
    )
    assert.strictEqual(data.body, 'one\n\ntwo')
  })

  test('refuses both body flags at once', async () => {
    await assert.rejects(
      () =>
        FabricChangesFile.func(
          {} as any,
          {
            stageId: 'stage_1',
            title: 'Ambiguous',
            body: 'inline',
            bodyFile: '/tmp/nope.md',
          } as any
        ) as Promise<unknown>,
      /not both/
    )
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
