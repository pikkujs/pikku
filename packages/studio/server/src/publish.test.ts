import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { StudioProjectsService, type CloudProject, type FabricAccount } from './projects.js'
import { publishPrompt, StudioPublisher, type Runner } from './publish.js'

const shop: CloudProject = { projectId: 'p-shop', name: 'Shop', slug: 'shop', productionBranch: 'main', gitRepoUrl: 'https://github.com/acme/shop.git' }

const account = (signedIn: boolean, cloud: CloudProject[]): FabricAccount => ({
  account: async () => ({ signedIn, apiUrl: 'http://fabric', consoleUrl: 'http://fabric/console' }),
  projects: async () => cloud,
  startSignIn: async () => ({ code: 'ABCD', url: 'http://fabric', expiresAt: new Date().toISOString() }),
  pollSignIn: async () => 'confirmed',
  signOut: async () => {},
})

const setup = async (signedIn: boolean, cloud: CloudProject[], remote?: string) => {
  const base = await mkdtemp(join(tmpdir(), 'pikku-studio-publish-'))
  const path = join(base, 'shop')
  await mkdir(path)
  await writeFile(join(path, 'package.json'), JSON.stringify({ name: 'shop' }))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: path, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('add', '-A')
  git('commit', '-qm', 'init')
  if (remote) git('remote', 'add', 'origin', remote)
  const projects = new StudioProjectsService({
    account: account(signedIn, cloud),
    home: join(base, 'studio'),
    devCommand: () => ({ command: 'sleep', args: ['30'] }),
    installCommand: () => null,
    waitForPort: async () => {},
    confine: false,
  })
  const added = await projects.add(path)
  return { projects, key: added.key }
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
}

describe('StudioPublisher', () => {
  test('says what Fabric needs before it can publish', async () => {
    const local = await setup(false, [])
    assert.equal((await new StudioPublisher(local.projects).options(local.key)).fabric, 'sign-in')
    const signedIn = await setup(true, [shop])
    assert.equal((await new StudioPublisher(signedIn.projects).options(signedIn.key)).fabric, 'not-in-fabric')
    await assert.rejects(new StudioPublisher(signedIn.projects).fabric(signedIn.key))
  })

  test('publishes a Fabric project by pushing its work and deploying it', async () => {
    const { projects, key } = await setup(true, [shop], 'git@github.com:acme/shop.git')
    const calls: string[] = []
    const run: Runner = async (command, args, cwd, onLine) => {
      calls.push(`${command} ${args.join(' ')}`)
      assert.match(cwd, /worktrees/)
      if (command === 'npx') onLine('Live at https://shop-main.pikku.app')
    }
    const publisher = new StudioPublisher(projects, run)
    assert.equal((await publisher.options(key)).fabric, 'ready')
    assert.equal((await publisher.fabric(key)).state, 'running')
    await until(() => publisher.status(key).state !== 'running')
    projects.closeAll()
    const job = publisher.status(key)
    assert.equal(job.state, 'done')
    assert.equal(job.url, 'https://shop-main.pikku.app')
    assert.deepEqual(calls.map((c) => c.split(' ').slice(0, 2).join(' ')), ['git add', 'git -c', 'git push', 'npx pikku'])
    assert.equal(calls[3], 'npx pikku fabric deploy apply -y')
  })

  test('reports a failed step', async () => {
    const { projects, key } = await setup(true, [shop], 'https://github.com/acme/shop')
    const publisher = new StudioPublisher(projects, async (command) => {
      if (command === 'git') throw new Error('push rejected')
    })
    await publisher.fabric(key)
    await until(() => publisher.status(key).state !== 'running')
    projects.closeAll()
    assert.deepEqual([publisher.status(key).state, publisher.status(key).error], ['failed', 'push rejected'])
  })

  test('every other cloud gets a setup prompt naming its adapter', () => {
    for (const [target, pkg] of [
      ['standalone', '@pikku/deploy-standalone'],
      ['cloudflare', '@pikku/deploy-cloudflare'],
      ['serverless', '@pikku/deploy-serverless'],
      ['azure', '@pikku/deploy-azure'],
    ] as const) {
      const prompt = publishPrompt(target, 'Shop')
      assert.match(prompt, new RegExp(pkg.replace('/', '\\/')))
      assert.match(prompt, new RegExp(`--provider ${target}`))
      assert.match(prompt, /"Shop"/)
    }
  })
})
