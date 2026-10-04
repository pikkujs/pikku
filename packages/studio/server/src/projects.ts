import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { homedir } from 'node:os'
import { builderHome, packageRoot, piPackageRoot, type Launcher } from '@pikku/builder'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  deriveConsoleUrl,
  getFabricRPC,
  matchRemoteProjects,
  readAuthFile,
  readConfigProjectId,
  resolveApiContext,
  writeAuthFile,
  writeConfigProjectId,
  type FabricProjectRow,
} from '@pikku/cli/fabric'
import { commitPaths, ensureWorktree, keepChanges, keepStatus, worktreeConfinement, type KeepResult, type KeepStatus, type StudioWorktree } from './worktree.js'
import { canConfine, confinedSpawn, type Confinement } from './confine.js'
import { previewViteConfig } from './vite-preview.js'

const execFileAsync = promisify(execFile)

export type ProjectLocation = 'local' | 'cloud' | 'both'

export interface StudioProject {
  key: string
  name: string
  location: ProjectLocation
  path: string | null
  fabricProjectId: string | null
  gitRepoUrl: string | null
  current: boolean
  missing: boolean
  open: boolean
}

export interface RunningProject {
  port: number
  token: string
  worktree: string
}

export interface ProjectApp {
  slug: string
  url: string | null
  state: 'starting' | 'ready' | 'failed'
}

type RunningApp = ProjectApp & { child: ChildProcess | null }

const GENERATED_SECRETS = ['BETTER_AUTH_SECRET', 'SCENARIO_ACTOR_SECRET']

const parseEnv = (path: string): Record<string, string> => {
  if (!existsSync(path)) return {}
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (match) env[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mjs', 'vite.config.js']
const PREVIEW_CONFIG = '__pikku_studio.vite.config.mjs'

const excludeFromGit = async (cwd: string, name: string) => {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd })
  const path = resolve(cwd, stdout.trim())
  const current = existsSync(path) ? await readFile(path, 'utf8') : ''
  if (current.split('\n').includes(name)) return
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${name}\n`)
}

export type CloudProject = FabricProjectRow

export interface StudioAccount {
  signedIn: boolean
  apiUrl: string
  consoleUrl: string
}

export type SignInStatus = 'pending' | 'confirmed' | 'expired' | 'rejected'

export interface FabricAccount {
  account(): Promise<StudioAccount>
  projects(): Promise<CloudProject[]>
  startSignIn(): Promise<{ code: string; url: string; expiresAt: string }>
  pollSignIn(code: string): Promise<SignInStatus>
  signOut(): Promise<void>
  modelAccess(): Promise<{ proxyUrl: string; apiKey: string }>
}

interface RegistryEntry {
  id: string
  path: string
  addedAt: string
}

export const studioHome = () =>
  process.env.PIKKU_STUDIO_HOME ?? join(homedir(), '.pikku', 'studio')

export const fabricAccount: FabricAccount = {
  async account() {
    const ctx = await resolveApiContext({ resolveProject: false })
    return {
      signedIn: !!ctx.token,
      apiUrl: ctx.apiUrl,
      consoleUrl: deriveConsoleUrl(ctx.apiUrl).replace(/\/$/, ''),
    }
  },
  async projects() {
    const ctx = await resolveApiContext({ resolveProject: false })
    if (!ctx.token) return []
    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { projects } = await rpc.invoke('fabricCliProjects', {})
    return projects
  },
  async startSignIn() {
    const ctx = await resolveApiContext({ resolveProject: false })
    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: null })
    const { code, expiresAt } = await rpc.invoke('requestCliAuth')
    return {
      code,
      expiresAt: new Date(expiresAt).toISOString(),
      url: `${deriveConsoleUrl(ctx.apiUrl).replace(/\/$/, '')}/cli-auth`,
    }
  },
  async pollSignIn(code) {
    const ctx = await resolveApiContext({ resolveProject: false })
    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: null })
    const result = await rpc.invoke('pollCliAuth', { code })
    if (result.status === 'confirmed' && result.token) {
      const auth = await readAuthFile()
      auth.tokens[ctx.apiUrl] = result.token
      auth.defaultApiUrl = ctx.apiUrl
      await writeAuthFile(auth)
      return 'confirmed'
    }
    if (result.status === 'consumed') return 'expired'
    return result.status === 'confirmed' ? 'pending' : result.status
  },
  async signOut() {
    const ctx = await resolveApiContext({ resolveProject: false })
    const auth = await readAuthFile()
    delete auth.tokens[ctx.apiUrl]
    await writeAuthFile(auth)
  },
  async modelAccess() {
    const ctx = await resolveApiContext({ resolveProject: false })
    if (!ctx.token) throw new Error('Sign in to Fabric to build with Fabric AI')
    const { proxyUrl, apiKey } = await getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token }).invoke(
      'getDeveloperLiteLLMKey',
      {}
    )
    return { proxyUrl, apiKey }
  },
}

const freePort = () =>
  new Promise<number>((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolvePort(port))
    })
  })

const run = (command: string, args: string[], cwd: string) =>
  new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr!.on('data', (d) => (stderr += d))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim()}`))
    )
  })

const exited = (child: ChildProcess, timeoutMs: number) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve(true)
    : new Promise<boolean>((done) => {
        const timer = setTimeout(() => done(false), timeoutMs)
        child.once('exit', () => {
          clearTimeout(timer)
          done(true)
        })
      })

const stopGracefully = async (child: ChildProcess | null, timeoutMs: number) => {
  if (!child) return
  child.kill('SIGINT')
  if (!(await exited(child, timeoutMs))) child.kill('SIGKILL')
}

const tail = async (path: string, lines = 20) => {
  const text = existsSync(path) ? await readFile(path, 'utf8') : ''
  return text.trimEnd().split('\n').slice(-lines).join('\n')
}

const waitForPort = async (port: number, timeoutMs = 180_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const up = await new Promise<boolean>((done) => {
      const socket = connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        done(true)
      })
      socket.once('error', () => done(false))
    })
    if (up) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`The project did not start on port ${port}`)
}

const entries = (dir: string) => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

const repoOf = (path: string) => {
  for (let dir = path; dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir
  }
  return path
}

export const linkedRepos = (root: string): string[] => {
  const packageDirs = [root, ...['packages', 'apps'].flatMap((d) => entries(join(root, d)).map((e) => join(root, d, e)))]
  const repos = new Set<string>()
  for (const dir of packageDirs) {
    const modules = join(dir, 'node_modules')
    for (const name of entries(modules)) {
      const names = name.startsWith('@') ? entries(join(modules, name)).map((n) => join(name, n)) : [name]
      for (const pkg of names) {
        const path = join(modules, pkg)
        try {
          if (!lstatSync(path).isSymbolicLink()) continue
          const target = realpathSync(path)
          if (!target.startsWith(root + sep)) repos.add(repoOf(target))
        } catch {}
      }
    }
  }
  return [...repos]
}

const defaultInstall = (dir: string) => {
  if (existsSync(join(dir, 'node_modules', '.bin'))) return null
  if (['bun.lock', 'bun.lockb', 'bunfig.toml'].some((file) => existsSync(join(dir, file)))) {
    return { command: 'bun', args: ['install'] }
  }
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return { command: 'pnpm', args: ['install'] }
  if (existsSync(join(dir, 'yarn.lock'))) return { command: 'yarn', args: ['install'] }
  return existsSync(join(dir, 'package.json')) ? { command: 'npm', args: ['install'] } : null
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'app'

async function projectName(path: string): Promise<string> {
  for (const file of [join(path, '.studio', 'project.json'), join(path, 'package.json')]) {
    try {
      const name = JSON.parse(await readFile(file, 'utf8'))?.name
      if (typeof name === 'string' && name.trim()) return name.trim()
    } catch {}
  }
  return basename(path)
}

export interface StudioProjectsOptions {
  currentRoot?: string | null
  account?: FabricAccount
  home?: string
  devCommand?: (port: number) => { command: string; args: string[] }
  installCommand?: (dir: string) => { command: string; args: string[] } | null
  designEntry?: string
  env?: () => Promise<Record<string, string>>
  waitForPort?: (port: number) => Promise<void>
  startApps?: boolean
  createCommand?: (name: string) => { command: string; args: string[] }
  projectsDir?: string
  confine?: false | ((worktree: StudioWorktree) => Confinement)
  databaseCommands?: () => Array<{ command: string; args: string[] }>
}

const outermostNodeModules = (path: string) => {
  const at = path.indexOf(`${sep}node_modules${sep}`)
  return at === -1 ? path : path.slice(0, at + `${sep}node_modules`.length)
}

export class StudioProjectsService {
  private running = new Map<string, RunningProject & { child: ChildProcess }>()
  private apps = new Map<string, RunningApp[]>()
  private keeping = new Set<Promise<unknown>>()
  private account: FabricAccount
  private home: string

  constructor(private options: StudioProjectsOptions = {}) {
    this.account = options.account ?? fabricAccount
    this.home = options.home ?? studioHome()
  }

  private get registryPath() {
    return join(this.home, 'projects.json')
  }

  private async registry(): Promise<RegistryEntry[]> {
    if (!existsSync(this.registryPath)) return []
    return JSON.parse(await readFile(this.registryPath, 'utf8')).projects ?? []
  }

  private async saveRegistry(projects: RegistryEntry[]) {
    await mkdir(this.home, { recursive: true })
    await writeFile(this.registryPath, JSON.stringify({ projects }, null, 2) + '\n')
  }

  get projectsDir() {
    return this.options.projectsDir ?? join(homedir(), 'Pikku')
  }

  getAccount() {
    return this.account.account()
  }

  modelAccess() {
    return this.account.modelAccess()
  }

  startSignIn() {
    return this.account.startSignIn()
  }

  pollSignIn(code: string) {
    return this.account.pollSignIn(code)
  }

  signOut() {
    return this.account.signOut()
  }

  async list(): Promise<StudioProject[]> {
    const entries = await this.registry()
    const current = this.options.currentRoot ? resolve(this.options.currentRoot) : null
    if (current && !entries.some((e) => resolve(e.path) === current)) {
      entries.unshift({ id: 'current', path: current, addedAt: new Date().toISOString() })
    }
    const cloud = await this.account.projects().catch(() => [] as CloudProject[])
    const claimed = new Set<string>()
    const local = await Promise.all(
      entries.map(async (entry): Promise<StudioProject> => {
        const missing = !existsSync(entry.path)
        const linkedId = missing ? null : (await readConfigProjectId(entry.path))?.projectId ?? null
        const byRemote = missing
          ? []
          : await matchRemoteProjects(cloud, entry.path).catch(() => [])
        const match =
          cloud.find((p) => p.projectId === linkedId) ??
          byRemote[0]?.matches[0]
        if (match) claimed.add(match.projectId)
        return {
          key: entry.id,
          name: match?.name ?? (missing ? basename(entry.path) : await projectName(entry.path)),
          location: match ? 'both' : 'local',
          path: entry.path,
          fabricProjectId: match?.projectId ?? linkedId,
          gitRepoUrl: match?.gitRepoUrl ?? null,
          current: resolve(entry.path) === current,
          missing,
          open: this.running.has(entry.id),
        }
      })
    )
    const remote = cloud
      .filter((p) => !claimed.has(p.projectId))
      .map(
        (p): StudioProject => ({
          key: `cloud:${p.projectId}`,
          name: p.name,
          location: 'cloud',
          path: null,
          fabricProjectId: p.projectId,
          gitRepoUrl: p.gitRepoUrl,
          current: false,
          missing: false,
          open: false,
        })
      )
    return [...local, ...remote]
  }

  async add(path: string): Promise<StudioProject> {
    const absolute = resolve(path)
    if (!existsSync(absolute)) throw new Error(`No folder at ${absolute}`)
    const entries = await this.registry()
    let entry = entries.find((e) => resolve(e.path) === absolute)
    if (!entry) {
      entry = { id: randomUUID().slice(0, 8), path: absolute, addedAt: new Date().toISOString() }
      entries.push(entry)
      await this.saveRegistry(entries)
    }
    return (await this.list()).find((p) => p.key === entry!.id)!
  }

  async remove(key: string): Promise<void> {
    this.close(key)
    await this.saveRegistry((await this.registry()).filter((e) => e.id !== key))
  }

  async create({ name, idea }: { name: string; idea?: string }): Promise<StudioProject> {
    const path = join(this.projectsDir, slugify(name))
    if (existsSync(path)) throw new Error(`${path} already exists`)
    await mkdir(this.projectsDir, { recursive: true })
    const { command, args } = (this.options.createCommand ??
      ((n) => ({
        command: 'npx',
        args: ['-y', 'create-pikku@latest', '--template', 'fabric', '--name', n, '--skip-install'],
      })))(slugify(name))
    await run(command, args, this.projectsDir)
    await mkdir(join(path, '.studio'), { recursive: true })
    await writeFile(
      join(path, '.studio', 'project.json'),
      JSON.stringify({ name, idea: idea ?? null }, null, 2) + '\n'
    )
    if (!existsSync(join(path, '.git'))) await run('git', ['init', '-q', '-b', 'main'], path)
    await commitPaths(path, ['.'], 'Start with Pikku Studio')
    return this.add(path)
  }

  async clone(fabricProjectId: string): Promise<StudioProject> {
    const project = (await this.account.projects()).find((p) => p.projectId === fabricProjectId)
    if (!project) throw new Error('That project is not in your Fabric account')
    if (!project.gitRepoUrl) throw new Error(`${project.name} has no repository to clone`)
    const path = join(this.projectsDir, project.slug)
    if (existsSync(path)) throw new Error(`${path} already exists`)
    await mkdir(this.projectsDir, { recursive: true })
    await run('git', ['clone', '-q', project.gitRepoUrl, path], this.projectsDir)
    if (!(await writeConfigProjectId(project.projectId, path))) {
      await writeFile(
        join(path, 'pikku.config.json'),
        JSON.stringify({ fabric: { projectId: project.projectId } }, null, 2) + '\n'
      )
    }
    await commitPaths(path, ['pikku.config.json'], 'Link to Fabric')
    return this.add(path)
  }

  private async entry(key: string): Promise<RegistryEntry> {
    const entry = (await this.registry()).find((e) => e.id === key)
    if (!entry) throw new Error('Add the project to Studio before opening it')
    return entry
  }

  async logs(key: string): Promise<{ sources: { id: string; lines: string[] }[] }> {
    await this.entry(key)
    const dir = join(this.home, 'logs')
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f === `${key}.log` || (f.startsWith(`${key}-`) && f.endsWith('.log'))) : []
    const sources = await Promise.all(
      files.sort().map(async (file) => ({
        id: file === `${key}.log` ? 'server' : file.slice(key.length + 1, -4),
        lines: (await tail(join(dir, file), 400)).replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter(Boolean),
      }))
    )
    return { sources: sources.sort((a, b) => Number(b.id === 'server') - Number(a.id === 'server')) }
  }

  async keepStatus(key: string): Promise<KeepStatus> {
    const entry = await this.entry(key)
    return keepStatus(entry.path, await ensureWorktree(entry.path, this.home, entry.id))
  }

  async keepChanges(key: string): Promise<KeepResult> {
    const entry = await this.entry(key)
    const keep = keepChanges(entry.path, await ensureWorktree(entry.path, this.home, entry.id))
    this.keeping.add(keep)
    return keep.finally(() => this.keeping.delete(keep))
  }

  async keys(): Promise<string[]> {
    return (await this.registry()).map((e) => e.id)
  }

  openKeys(): string[] {
    return [...this.running.keys()]
  }

  async settle(): Promise<void> {
    await Promise.allSettled([...this.keeping])
  }

  async stop(key: string, timeoutMs = 10_000): Promise<void> {
    const running = this.running.get(key)
    const apps = this.apps.get(key) ?? []
    this.running.delete(key)
    this.apps.delete(key)
    await Promise.all([running?.child ?? null, ...apps.map((app) => app.child)].map((child) => stopGracefully(child, timeoutMs)))
  }

  async projectDir(key: string): Promise<string> {
    const entry = (await this.registry()).find((e) => e.id === key)
    if (!entry) throw new Error('Add the project to Studio before opening it')
    return (await ensureWorktree(entry.path, this.home, entry.id)).projectDir
  }

  async builderLaunch(key: string): Promise<{ cwd: string; apiUrl?: string; apps: { slug: string; url: string }[]; env: Record<string, string>; launch?: Launcher }> {
    const entry = (await this.registry()).find((e) => e.id === key)
    if (!entry) throw new Error('Add the project to Studio before opening it')
    const worktree = await ensureWorktree(entry.path, this.home, entry.id)
    const port = this.running.get(key)?.port
    const base = {
      cwd: worktree.projectDir,
      apiUrl: port ? `http://localhost:${port}` : undefined,
      apps: this.projectApps(key).flatMap(({ slug, url, state }) => (state === 'ready' && url ? [{ slug, url }] : [])),
      env: await this.projectEnv(key, entry.path),
    }
    const confinement = this.confinement(worktree)
    if (!confinement) return base
    const sandbox: Confinement = {
      ...confinement,
      writable: [...(confinement.writable ?? []), process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent')],
      readable: [
        ...(confinement.readable ?? []),
        outermostNodeModules(piPackageRoot()),
        packageRoot,
        builderHome(),
        join(this.home, 'logs'),
        dirname(process.execPath),
      ],
    }
    return {
      ...base,
      launch: (command, args, options) =>
        confinedSpawn(command, args, sandbox, { ...options, stdio: ['pipe', 'pipe', 'pipe'] }),
    }
  }

  private async designCopy(key: string): Promise<string | undefined> {
    const entry = this.options.designEntry
    if (!entry) return undefined
    const source = dirname(entry)
    const copy = join(this.home, 'design', key)
    await rm(copy, { recursive: true, force: true })
    await cp(source, copy, {
      recursive: true,
      filter: (path) => path !== join(source, 'workspace'),
    })
    const modules = join(source, '..', 'node_modules')
    if (existsSync(modules)) await symlink(modules, join(copy, 'node_modules'), 'dir')
    return join(copy, basename(entry))
  }

  private confinement(worktree: StudioWorktree, design?: string): Confinement | null {
    if (this.options.confine === false || !canConfine()) return null
    if (this.options.confine) return this.options.confine(worktree)
    const base = worktreeConfinement(worktree)
    const readable = [join(homedir(), '.fabric', 'auth.json')]
    if (this.options.designEntry) readable.push(resolve(this.options.designEntry, '..', '..'))
    readable.push(...linkedRepos(worktree.path))
    const writable = design ? [dirname(design)] : []
    return {
      ...base,
      readable: [...(base.readable ?? []), ...readable, ...writable],
      writable: [...(base.writable ?? []), ...writable],
    }
  }

  async projectEnv(key: string, projectPath: string): Promise<Record<string, string>> {
    const own = parseEnv(join(projectPath, '.env'))
    const path = join(this.home, 'env', `${key}.env`)
    const defaults = parseEnv(path)
    const missing = GENERATED_SECRETS.filter((name) => !own[name] && !defaults[name])
    if (missing.length > 0) {
      for (const name of missing) defaults[name] = randomBytes(32).toString('base64')
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, Object.entries(defaults).map(([name, value]) => `${name}=${value}`).join('\n') + '\n', { mode: 0o600 })
    }
    return { ...defaults, ...own }
  }

  runningProject(key: string): RunningProject | null {
    const running = this.running.get(key)
    return running ? { port: running.port, token: running.token, worktree: running.worktree } : null
  }

  async open(key: string): Promise<RunningProject> {
    const existing = this.runningProject(key)
    if (existing) return existing
    const entry = (await this.registry()).find((e) => e.id === key)
    if (!entry) throw new Error('Add the project to Studio before opening it')
    const worktree = await ensureWorktree(entry.path, this.home, entry.id)
    const install = (this.options.installCommand ?? defaultInstall)(worktree.projectDir)
    if (install) await run(install.command, install.args, worktree.projectDir)
    const port = await freePort()
    const token = randomBytes(32).toString('hex')
    const { command, args } = (this.options.devCommand ??
      ((p) => ({ command: 'npx', args: ['pikku', 'dev', '--port', String(p)] })))(port)
    const design = await this.designCopy(key)
    const confinement = this.confinement(worktree, design)
    await mkdir(join(this.home, 'logs'), { recursive: true })
    const logPath = join(this.home, 'logs', `${key}.log`)
    const log = openSync(logPath, 'w')
    const spawnOptions = {
      cwd: worktree.projectDir,
      stdio: ['ignore', log, log] as ['ignore', number, number],
      env: {
        ...process.env,
        PORT: String(port),
        PIKKU_STUDIO_TOKEN: token,
        ...(design ? { PIKKU_STUDIO_DESIGN: design } : {}),
        ...(await this.projectEnv(key, entry.path)),
        ...(await (this.options.env?.() ?? {})),
      },
    }
    const child = confinement
      ? confinedSpawn(command, args, confinement, spawnOptions)
      : spawn(command, args, spawnOptions)
    closeSync(log)
    const exited = new Promise<never>((_, reject) =>
      child.once('exit', async () =>
        reject(new Error(`The project stopped while starting:\n${await tail(logPath)}`))
      )
    )
    exited.catch(() => {})
    const running = { child, port, token, worktree: worktree.projectDir }
    this.running.set(key, running)
    child.on('exit', () => {
      if (this.running.get(key) === running) this.running.delete(key)
    })
    try {
      await Promise.race([(this.options.waitForPort ?? waitForPort)(port), exited])
    } catch (error) {
      this.close(key)
      const message = error instanceof Error ? error.message : String(error)
      if (message.startsWith('The project stopped')) throw error
      throw new Error(`${message}:\n${await tail(logPath)}`)
    }
    if (this.options.startApps !== false) this.startApps(key, worktree.projectDir, port, confinement, spawnOptions.env)
    return { port, token, worktree: worktree.projectDir }
  }

  async updateDatabase(key: string): Promise<void> {
    const entry = (await this.registry()).find((e) => e.id === key)
    if (!entry) throw new Error('Add the project to Studio before opening it')
    this.close(key)
    const worktree = await ensureWorktree(entry.path, this.home, entry.id)
    const commands = this.options.databaseCommands?.() ?? [
      { command: 'npx', args: ['pikku', 'db', 'generate'] },
      { command: 'npx', args: ['pikku', 'db', 'migrate'] },
    ]
    for (const { command, args } of commands) await run(command, args, worktree.projectDir)
    if (existsSync(join(worktree.projectDir, 'db'))) {
      await commitPaths(worktree.projectDir, ['db'], 'Update the database')
    }
  }

  close(key: string) {
    this.running.get(key)?.child.kill()
    this.running.delete(key)
    for (const app of this.apps.get(key) ?? []) app.child?.kill()
    this.apps.delete(key)
  }

  projectApps(key: string): ProjectApp[] {
    return (this.apps.get(key) ?? []).map(({ slug, url, state }) => ({ slug, url, state }))
  }

  private startApps(key: string, projectDir: string, apiPort: number, confinement: Confinement | null, env: NodeJS.ProcessEnv) {
    const root = join(projectDir, 'apps')
    const slugs = entries(root).filter((slug) => {
      const pkg = join(root, slug, 'package.json')
      if (!existsSync(pkg)) return false
      try {
        return /\bvite\b/.test(JSON.parse(readFileSync(pkg, 'utf8')).scripts?.dev ?? '')
      } catch {
        return false
      }
    })
    const apps: RunningApp[] = slugs.map((slug) => ({ slug, url: null, state: 'starting', child: null }))
    this.apps.set(key, apps)
    for (const app of apps) {
      void (async () => {
        const port = await freePort()
        const cwd = join(root, app.slug)
        const logPath = join(this.home, 'logs', `${key}-${app.slug}.log`)
        const log = openSync(logPath, 'w')
        const args = ['vite', 'dev', '--port', String(port), '--strictPort', '--host', '127.0.0.1']
        if (VITE_CONFIGS.some((name) => existsSync(join(cwd, name)))) {
          await writeFile(join(cwd, PREVIEW_CONFIG), previewViteConfig(cwd))
          await excludeFromGit(cwd, PREVIEW_CONFIG)
          args.push('--config', PREVIEW_CONFIG)
        }
        const options = {
          cwd,
          stdio: ['ignore', log, log] as ['ignore', number, number],
          env: { ...env, VITE_API_PROXY: `http://localhost:${apiPort}` },
        }
        const vite = [cwd, projectDir].map((dir) => join(dir, 'node_modules', '.bin', 'vite')).find((bin) => existsSync(bin))
        const [command, commandArgs] = vite ? [vite, args.slice(1)] : ['npx', args]
        const child = confinement
          ? confinedSpawn(command, commandArgs, confinement, options)
          : spawn(command, commandArgs, options)
        closeSync(log)
        app.child = child
        child.once('exit', () => {
          if (app.state !== 'ready') app.state = 'failed'
          app.child = null
        })
        try {
          await (this.options.waitForPort ?? waitForPort)(port)
          app.url = `http://127.0.0.1:${port}`
          app.state = 'ready'
        } catch {
          app.state = 'failed'
        }
      })()
    }
  }

  closeAll() {
    for (const key of this.running.keys()) this.close(key)
  }
}
