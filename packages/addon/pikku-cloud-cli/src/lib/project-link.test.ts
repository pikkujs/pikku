import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '@pikku/cli/addon-support'
import {
  matchRemoteProjects,
  normalizeRepoUrl,
  resolveLinkedProject,
  type CloudProjectRow,
} from './project-link.js'

const row = (
  projectId: string,
  gitRepoUrl: string | null
): CloudProjectRow => ({
  projectId,
  name: `name-${projectId}`,
  slug: `slug-${projectId}`,
  productionBranch: 'main',
  gitRepoUrl,
})

const fakeRpc = (projects: CloudProjectRow[] | Error) => {
  const calls: string[] = []
  const rpc = {
    invoke: async (name: string) => {
      calls.push(name)
      if (projects instanceof Error) throw projects
      return { projects }
    },
  } as unknown as Parameters<typeof resolveLinkedProject>[0]['rpc']
  return { rpc, calls }
}

const repoWithRemotes = async (remotes: Record<string, string>) => {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-project-link-'))
  await git(['init', '-q', '-b', 'main'], dir)
  for (const [name, url] of Object.entries(remotes)) {
    await git(['remote', 'add', name, url], dir)
  }
  return dir
}

describe('normalizeRepoUrl', () => {
  test('every spelling of one repo compares equal', () => {
    const expected = 'github.com/acme/shop'
    for (const url of [
      'https://github.com/acme/shop',
      'https://github.com/acme/shop.git',
      'https://github.com/acme/shop/',
      'https://user:token@github.com/Acme/Shop.git',
      'git@github.com:acme/shop.git',
      'ssh://git@github.com/acme/shop',
    ]) {
      assert.equal(normalizeRepoUrl(url), expected, url)
    }
  })

  test('keeps the port, so two gitea instances stay apart', () => {
    assert.equal(
      normalizeRepoUrl('http://localhost:3300/cloud/app.git'),
      'localhost:3300/cloud/app'
    )
  })

  test('rejects what is not a repo url', () => {
    assert.equal(normalizeRepoUrl(''), null)
    assert.equal(normalizeRepoUrl('not a url'), null)
    assert.equal(normalizeRepoUrl('https://github.com/'), null)
  })
})

describe('matchRemoteProjects', () => {
  test('origin is tried before other remotes', async () => {
    const dir = await repoWithRemotes({
      fork: 'https://github.com/me/shop.git',
      origin: 'git@github.com:acme/shop.git',
    })
    const [first] = await matchRemoteProjects(
      [
        row('fork-project', 'https://github.com/me/shop'),
        row('origin-project', 'https://github.com/acme/shop'),
      ],
      dir
    )
    assert.equal(first?.remote, 'origin')
    assert.deepEqual(
      first?.matches.map((p) => p.projectId),
      ['origin-project']
    )
  })
})

describe('resolveLinkedProject', () => {
  const saved = process.env.PIKKUSTUDIO_PROJECT_ID
  beforeEach(() => {
    delete process.env.PIKKUSTUDIO_PROJECT_ID
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.PIKKUSTUDIO_PROJECT_ID
    else process.env.PIKKUSTUDIO_PROJECT_ID = saved
  })

  test('PIKKUSTUDIO_PROJECT_ID wins without asking cloud', async () => {
    process.env.PIKKUSTUDIO_PROJECT_ID = 'from-env'
    const { rpc, calls } = fakeRpc([])
    const project = await resolveLinkedProject({ rpc })
    assert.equal(project?.projectId, 'from-env')
    assert.equal(project?.source, 'env')
    assert.deepEqual(calls, [])
  })

  test('projectId in pikku.config.json wins over the remote without asking cloud', async () => {
    const dir = await repoWithRemotes({
      origin: 'https://github.com/acme/shop.git',
    })
    await writeFile(
      join(dir, 'pikku.config.json'),
      '{"cloud":{"projectId":"cfg"}}'
    )
    const { rpc, calls } = fakeRpc([
      row('shop', 'https://github.com/acme/shop'),
    ])
    const project = await resolveLinkedProject({ rpc, cwd: dir })
    assert.equal(project?.projectId, 'cfg')
    assert.equal(project?.source, 'config')
    assert.deepEqual(calls, [])
  })

  test('a remote match is written into pikku.config.json', async () => {
    const dir = await repoWithRemotes({
      origin: 'https://github.com/acme/shop.git',
    })
    await writeFile(join(dir, 'pikku.config.json'), '{\n  "outDir": "x"\n}\n')
    const { rpc } = fakeRpc([row('shop', 'https://github.com/acme/shop')])
    await resolveLinkedProject({ rpc, cwd: dir })
    assert.match(
      await readFile(join(dir, 'pikku.config.json'), 'utf8'),
      /"cloud": \{ "projectId": "shop" \}/
    )
  })

  test('the git remote names the project', async () => {
    const dir = await repoWithRemotes({
      origin: 'https://github.com/acme/shop.git',
    })
    const { rpc } = fakeRpc([
      row('other', 'https://github.com/acme/other'),
      row('shop', 'https://github.com/acme/shop'),
    ])
    const project = await resolveLinkedProject({ rpc, cwd: dir })
    assert.equal(project?.projectId, 'shop')
    assert.equal(project?.source, 'remote')
    assert.equal(project?.name, 'name-shop')
    assert.match(project!.detail, /^origin → /)
  })

  test('two projects on one repo are refused, not guessed between', async () => {
    const dir = await repoWithRemotes({
      origin: 'https://github.com/acme/shop.git',
    })
    const { rpc } = fakeRpc([
      row('a', 'https://github.com/acme/shop'),
      row('b', 'git@github.com:acme/shop.git'),
    ])
    await assert.rejects(
      resolveLinkedProject({ rpc, cwd: dir }),
      /2 cloud projects[\s\S]*PIKKUSTUDIO_PROJECT_ID/
    )
  })

  test('no matching remote is unlinked', async () => {
    const dir = await repoWithRemotes({
      origin: 'https://github.com/acme/shop.git',
    })
    const { rpc } = fakeRpc([])
    assert.equal(await resolveLinkedProject({ rpc, cwd: dir }), null)
  })

  test('a failed lookup is reported', async () => {
    const dir = await repoWithRemotes({
      origin: 'https://github.com/acme/shop.git',
    })
    const { rpc } = fakeRpc(new Error('cloud is down'))
    await assert.rejects(
      resolveLinkedProject({ rpc, cwd: dir }),
      /cloud is down/
    )
  })

  test('a checkout with no remotes never asks cloud', async () => {
    const dir = await repoWithRemotes({})
    const { rpc, calls } = fakeRpc([])
    assert.equal(await resolveLinkedProject({ rpc, cwd: dir }), null)
    assert.deepEqual(calls, [])
  })
})
