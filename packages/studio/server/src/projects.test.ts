import { homedir } from 'node:os'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { StudioProjectsService, linkedRepos, type CloudProject, type FabricAccount } from './projects.js'
import { symlink } from 'node:fs/promises'

const fakeAccount = (projects: CloudProject[]): FabricAccount => ({
  account: async () => ({ signedIn: projects.length > 0, apiUrl: 'http://fabric', consoleUrl: 'http://fabric' }),
  projects: async () => projects,
  startSignIn: async () => ({ code: 'ABCD', url: 'http://fabric/cli-auth', expiresAt: new Date().toISOString() }),
  pollSignIn: async () => 'confirmed',
  signOut: async () => {},
})

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'pipe' })

const repo = async (base: string, name: string, remote?: string) => {
  const path = join(base, name)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'package.json'), JSON.stringify({ name }))
  git(path, 'init', '-q', '-b', 'main')
  git(path, 'add', '-A')
  git(path, 'commit', '-qm', 'init')
  if (remote) git(path, 'remote', 'add', 'origin', remote)
  return path
}

const setup = async (cloud: CloudProject[] = []) => {
  const base = await mkdtemp(join(tmpdir(), 'pikku-studio-projects-'))
  const service = new StudioProjectsService({
    account: fakeAccount(cloud),
    home: join(base, 'studio'),
    projectsDir: join(base, 'Pikku'),
    devCommand: () => ({ command: 'sleep', args: ['30'] }),
    installCommand: () => null,
    waitForPort: async () => {},
    createCommand: (name) => ({ command: 'mkdir', args: [name] }),
  })
  return { base, service }
}

describe('StudioProjectsService', () => {
  test('updates the database and commits the migration in the worktree', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pikku-studio-projects-'))
    const service = new StudioProjectsService({
      account: fakeAccount([]),
      home: join(base, 'studio'),
      databaseCommands: () => [{ command: 'sh', args: ['-c', 'mkdir -p db/sqlite && echo "create table agent_run (id text);" > db/sqlite/0007-pikku-runtime.sql'] }],
      installCommand: () => null,
      confine: false,
    })
    const added = await service.add(await repo(base, 'shop'))
    await service.updateDatabase(added.key)
    const worktree = join(base, 'studio', 'worktrees', added.key)
    const log = execFileSync('git', ['-C', worktree, 'log', '--format=%s', '-1', '--', 'db']).toString().trim()
    assert.equal(log, 'Update the database')
  })

  test('lets a project read the repos its linked packages come from', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pikku-studio-links-'))
    const other = await repo(base, 'lib')
    await mkdir(join(other, 'packages', 'core'), { recursive: true })
    const app = await repo(base, 'app')
    await mkdir(join(app, 'node_modules', '@acme'), { recursive: true })
    await symlink(join(other, 'packages', 'core'), join(app, 'node_modules', '@acme', 'core'))
    assert.deepEqual(linkedRepos(app), [await import('node:fs').then((fs) => fs.realpathSync(other))])
  })

  test('says why a project stopped while starting', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pikku-studio-projects-'))
    const service = new StudioProjectsService({
      account: fakeAccount([]),
      home: join(base, 'studio'),
      devCommand: () => ({ command: 'sh', args: ['-c', "echo \"Error: The 'agent' schema is not in this database\" >&2; exit 1"] }),
      installCommand: () => null,
      confine: false,
    })
    const added = await service.add(await repo(base, 'shop'))
    await assert.rejects(service.open(added.key), /stopped while starting:\nError: The 'agent' schema/)
    assert.equal(service.runningProject(added.key), null)
  })

  test('runs the project confined to its worktree', { skip: process.platform !== 'darwin' }, async () => {
    const base = await mkdtemp(join(tmpdir(), 'pikku-studio-projects-'))
    const outside = join(homedir(), `.pikku-studio-probe-${process.pid}`)
    const service = new StudioProjectsService({
      account: fakeAccount([]),
      home: join(base, 'studio'),
      devCommand: () => ({
        command: 'sh',
        args: ['-c', `touch inside; touch ${outside}; touch done; sleep 30`],
      }),
      installCommand: () => null,
      waitForPort: async () => {},
    })
    const added = await service.add(await repo(base, 'shop'))
    const opened = await service.open(added.key)
    for (let i = 0; i < 100 && !existsSync(join(opened.worktree, 'done')); i++) {
      await new Promise((r) => setTimeout(r, 20))
    }
    service.close(added.key)
    assert.ok(existsSync(join(opened.worktree, 'inside')))
    assert.equal(existsSync(outside), false)
  })

  test('lists local, cloud and both', async () => {
    const shop: CloudProject = { projectId: 'p-shop', name: 'Shop', slug: 'shop', productionBranch: 'main', gitRepoUrl: 'https://github.com/acme/shop.git' }
    const blog: CloudProject = { projectId: 'p-blog', name: 'Blog', slug: 'blog', productionBranch: 'main', gitRepoUrl: 'https://github.com/acme/blog' }
    const { base, service } = await setup([shop, blog])
    await service.add(await repo(base, 'notes'))
    await service.add(await repo(base, 'shop', 'git@github.com:acme/shop.git'))
    const projects = await service.list()
    const by = Object.fromEntries(projects.map((p) => [p.name, p]))
    assert.equal(by.notes.location, 'local')
    assert.equal(by.Shop.location, 'both')
    assert.equal(by.Shop.fabricProjectId, 'p-shop')
    assert.equal(by.Blog.location, 'cloud')
    assert.equal(by.Blog.path, null)
    assert.equal(projects.length, 3)
  })

  test('adding the same folder twice keeps one entry', async () => {
    const { base, service } = await setup()
    const path = await repo(base, 'notes')
    await service.add(path)
    await service.add(path)
    assert.equal((await service.list()).length, 1)
  })

  test('creates a project and records the idea', async () => {
    const { base, service } = await setup()
    const project = await service.create({ name: 'Plant Diary', idea: 'Log my watering' })
    assert.equal(project.path, join(base, 'Pikku', 'plant-diary'))
    const file = JSON.parse(await readFile(join(project.path!, '.studio', 'project.json'), 'utf8'))
    assert.deepEqual(file, { name: 'Plant Diary', idea: 'Log my watering' })
    assert.equal(project.name, 'Plant Diary')
    const opened = await service.open(project.key)
    assert.ok(existsSync(join(opened.worktree, '.studio', 'project.json')))
    service.close(project.key)
    await assert.rejects(service.create({ name: 'Plant Diary' }))
  })

  test('clones a cloud project and links it', async () => {
    const { base } = await setup()
    const origin = await repo(base, 'origin-blog')
    const { service } = await setup([{ projectId: 'p-blog', name: 'Blog', slug: 'blog', productionBranch: 'main', gitRepoUrl: origin }])
    const project = await service.clone('p-blog')
    assert.equal(project.location, 'both')
    assert.ok(existsSync(join(project.path!, 'package.json')))
    const config = JSON.parse(await readFile(join(project.path!, 'pikku.config.json'), 'utf8'))
    assert.equal(config.fabric.projectId, 'p-blog')
    const opened = await service.open(project.key)
    assert.match(await readFile(join(opened.worktree, 'pikku.config.json'), 'utf8'), /p-blog/)
    service.close(project.key)
    assert.equal((await service.list()).filter((p) => p.fabricProjectId === 'p-blog').length, 1)
  })

  test('opens a project in a subfolder of a bigger repo at that subfolder', async () => {
    const { base, service } = await setup()
    const mono = await repo(base, 'mono')
    await mkdir(join(mono, 'apps', 'shop'), { recursive: true })
    await writeFile(join(mono, 'apps', 'shop', 'package.json'), JSON.stringify({ name: 'shop' }))
    git(mono, 'add', '-A')
    git(mono, 'commit', '-qm', 'shop')
    const added = await service.add(join(mono, 'apps', 'shop'))
    assert.equal(added.name, 'shop')
    const opened = await service.open(added.key)
    assert.equal(opened.worktree, join(base, 'studio', 'worktrees', added.key, 'apps', 'shop'))
    assert.ok(existsSync(join(opened.worktree, 'package.json')))
    assert.equal(existsSync(join(mono, 'apps', 'shop', '.git')), false)
    service.close(added.key)
  })

  test('opens a project in its own worktree and closes it', async () => {
    const { base, service } = await setup()
    const added = await service.add(await repo(base, 'notes'))
    const opened = await service.open(added.key)
    assert.equal(opened.worktree, join(base, 'studio', 'worktrees', added.key))
    assert.equal(opened.token.length, 64)
    assert.equal((await service.open(added.key)).port, opened.port)
    assert.equal((await service.list())[0].open, true)
    service.close(added.key)
    assert.equal((await service.list())[0].open, false)
  })

  test('stops an open project gracefully and says which were open', async () => {
    const { base, service } = await setup()
    const added = await service.add(await repo(base, 'notes'))
    await service.open(added.key)
    assert.deepEqual(await service.keys(), [added.key])
    assert.deepEqual(service.openKeys(), [added.key])
    await service.settle()
    await service.stop(added.key, 2000)
    assert.deepEqual(service.openKeys(), [])
    assert.equal(service.runningProject(added.key), null)
  })
})

describe('projectEnv', () => {
  test('generates the auth secrets once and lets the project .env win', async () => {
    const home = await mkdtemp(join(tmpdir(), 'studio-env-'))
    const project = await mkdtemp(join(tmpdir(), 'studio-env-project-'))
    await writeFile(join(project, '.env'), 'BETTER_AUTH_SECRET="mine"\nAPI_KEY=abc\n')
    const projects = new StudioProjectsService({ home })
    const first = await projects.projectEnv('p1', project)
    assert.equal(first.BETTER_AUTH_SECRET, 'mine')
    assert.equal(first.API_KEY, 'abc')
    assert.ok(first.SCENARIO_ACTOR_SECRET!.length >= 32)
    const second = await projects.projectEnv('p1', project)
    assert.equal(second.SCENARIO_ACTOR_SECRET, first.SCENARIO_ACTOR_SECRET)
    assert.equal(await readFile(join(project, '.env'), 'utf8'), 'BETTER_AUTH_SECRET="mine"\nAPI_KEY=abc\n')
  })
})
