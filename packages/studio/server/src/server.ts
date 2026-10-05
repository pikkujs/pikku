import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { connect } from 'node:net'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StudioProjectsService, studioHome } from './projects.js'
import { StudioPublisher } from './publish.js'
import { BuilderSession, changesReport } from '@pikku/builder'
import { KEY_PROVIDERS, StudioAi, SUBSCRIPTION_PROVIDERS, type AiInput } from './ai.js'

export type SignInChoice = 'local' | 'fabric'

export interface StudioSettings {
  signIn: SignInChoice | null
}

const STUDIO_HEADER = 'x-pikku-studio'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
}

export const resolveConsoleApp = () =>
  resolve(fileURLToPath(import.meta.resolve('@pikku/cli/fabric')), '..', '..', '..', '..', 'console-app')

export const resolveDesignEntry = () =>
  fileURLToPath(new URL('../design/start.mjs', import.meta.url))

class StudioSettingsFile {
  constructor(private path: string) {}

  async read(): Promise<StudioSettings> {
    if (!existsSync(this.path)) return { signIn: null }
    return { signIn: null, ...JSON.parse(await readFile(this.path, 'utf8')) }
  }

  async update(patch: Partial<StudioSettings>) {
    const next = { ...(await this.read()), ...patch }
    await mkdir(join(this.path, '..'), { recursive: true })
    await writeFile(this.path, JSON.stringify(next, null, 2) + '\n')
    return next
  }
}

const readBody = async (req: IncomingMessage) => {
  let body = ''
  for await (const chunk of req) body += chunk
  return body ? JSON.parse(body) : {}
}

const send = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value ?? null))
}

export interface StudioServerOptions {
  port?: number
  host?: string
  projects?: StudioProjectsService
  consoleDir?: string
  home?: string
  publisher?: StudioPublisher
  builder?: BuilderSession
}

export async function startStudioServer(options: StudioServerOptions = {}) {
  const home = options.home ?? studioHome()
  const ai = new StudioAi(home)
  const projects =
    options.projects ??
    new StudioProjectsService({ home, designEntry: resolveDesignEntry(), env: () => ai.env() })
  const publisher = options.publisher ?? new StudioPublisher(projects)
  const builder =
    options.builder ??
    new BuilderSession(async (key) => {
      const env = await ai.env()
      if (!env.PIKKU_STUDIO_AI) throw new Error('Choose your AI before building')
      const fabric = env.PIKKU_STUDIO_AI === 'fabric' ? await projects.modelAccess() : null
      const launch = await projects.builderLaunch(key)
      return {
        ...launch,
        ai: fabric
          ? { model: env.PIKKU_STUDIO_MODEL ?? 'gemini-flash-lite-latest', proxy: { url: fabric.proxyUrl, key: fabric.apiKey } }
          : { provider: env.PIKKU_STUDIO_AI_PROVIDER, model: env.PIKKU_STUDIO_MODEL },
        env: { ...launch.env, ...env, PIKKU_DEV_LOG: join(home, 'logs', `${key}.log`) },
      }
    }, join(home, 'builder'))
  const settings = new StudioSettingsFile(join(home, 'settings.json'))
  const consoleDir = options.consoleDir ?? process.env.PIKKU_STUDIO_CONSOLE ?? resolveConsoleApp()

  const actions: Record<string, (input: any) => Promise<unknown>> = {
    async account() {
      const [current, account] = await Promise.all([settings.read(), projects.getAccount()])
      const signIn = current.signIn === 'fabric' && !account.signedIn ? null : current.signIn
      return { signIn, ai: await ai.choice(), ...account }
    },
    aiOptions: async () => ({ keys: KEY_PROVIDERS, subscriptions: SUBSCRIPTION_PROVIDERS }),
    setAi: (input: AiInput) => ai.set(input),
    async changeAi() {
      await ai.clear()
      return null
    },
    useLocally: () => settings.update({ signIn: 'local' }),
    startSignIn: () => projects.startSignIn(),
    async pollSignIn({ code }: { code: string }) {
      const status = await projects.pollSignIn(code)
      if (status === 'confirmed') {
        await settings.update({ signIn: 'fabric' })
        if (!(await ai.choice())) await ai.set({ kind: 'fabric' })
      }
      return { status }
    },
    async signOut() {
      const current = await settings.read()
      if (current.signIn === 'fabric') {
        await projects.signOut()
        if ((await ai.choice())?.kind === 'fabric') await ai.clear()
      }
      return settings.update({ signIn: null })
    },
    listProjects: async () => ({ projects: await projects.list() }),
    addProject: ({ path }: { path: string }) => projects.add(path),
    createProject: (input: { name: string; idea?: string }) => projects.create(input),
    cloneProject: ({ fabricProjectId }: { fabricProjectId: string }) => projects.clone(fabricProjectId),
    removeProject: ({ key }: { key: string }) => projects.remove(key),
    async openProject({ key }: { key: string }) {
      await projects.open(key)
      return { serverUrl: `/p/${key}` }
    },
    async updateDatabase({ key }: { key: string }) {
      await projects.updateDatabase(key)
      await projects.open(key)
      return { serverUrl: `/p/${key}` }
    },
    async closeProject({ key }: { key: string }) {
      projects.close(key)
      return null
    },
    async closeAllProjects() {
      projects.closeAll()
      return null
    },
    publishOptions: ({ key }: { key: string }) => publisher.options(key),
    publishToFabric: ({ key }: { key: string }) => publisher.fabric(key),
    publishStatus: async ({ key }: { key: string }) => publisher.status(key),
    projectApps: async ({ key }: { key: string }) => projects.projectApps(key),
    builderState: ({ key }: { key: string }) => builder.state(key),
    projectLogs: ({ key }: { key: string }) => projects.logs(key),
    keepStatus: ({ key }: { key: string }) => projects.keepStatus(key),
    keepChanges: ({ key }: { key: string }) => projects.keepChanges(key),
    changes: async ({ key }: { key: string }) => changesReport(await projects.projectDir(key)),
    builderPrompt: ({ key, message, context }: { key: string; message: string; context?: string }) =>
      builder.prompt(key, message, context),
    async builderCancel({ key }: { key: string }) {
      builder.cancel(key)
      return builder.state(key)
    },
    builderConversations: async ({ key }: { key: string }) => ({ conversations: await builder.conversations(key) }),
    builderResume: ({ key, session }: { key: string; session: string }) => builder.resume(key, session),
    async builderForget({ key, session }: { key: string; session: string }) {
      await builder.forget(key, session)
      return builder.state(key)
    },
    async builderClear({ key }: { key: string }) {
      await builder.clear(key)
      return builder.state(key)
    },
  }

  const serveConsole = async (req: IncomingMessage, res: ServerResponse, path: string) => {
    const relative = normalize(path.replace(/^\/console\/?/, '')).replace(/^(\.\.[/\\])+/, '')
    let file = join(consoleDir, relative)
    if (!relative || !existsSync(file) || !extname(file)) file = join(consoleDir, 'index.html')
    if (!existsSync(file)) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('The console is not built')
      return
    }
    let body: Buffer | string = await readFile(file)
    if (file.endsWith('index.html')) {
      body = body
        .toString('utf8')
        .replace('<head>', '<head><script>window.__PIKKU_STUDIO__={}</script>')
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(req.method === 'HEAD' ? undefined : body)
  }

  const serveShot = async (res: ServerResponse, path: string) => {
    const [key, ...rest] = decodeURIComponent(path.slice('/studio/shot/'.length)).split('/')
    const root = join(await projects.projectDir(key!), '.pikku', 'builder', 'looks')
    const file = normalize(join(root, ...rest.slice(rest[0] === '.pikku' ? 3 : 0)))
    if (!file.startsWith(root + sep) || extname(file) !== '.png' || !existsSync(file)) return send(res, 404, { error: 'Not found' })
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' })
    res.end(await readFile(file))
  }

  const target = (url: string) => {
    const match = url.match(/^\/p\/([^/?]+)(.*)$/)
    if (!match) return null
    const running = projects.runningProject(match[1]!)
    return running ? { running, path: match[2] || '/' } : null
  }

  const proxy = (req: IncomingMessage, res: ServerResponse) => {
    const found = target(req.url ?? '')
    if (!found) return send(res, 404, { error: 'That project is not open' })
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: found.running.port,
        method: req.method,
        path: found.path,
        headers: { ...req.headers, host: `127.0.0.1:${found.running.port}`, [STUDIO_HEADER]: found.running.token },
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(res)
      }
    )
    upstream.on('error', (error) => {
      if (!res.headersSent) send(res, 502, { error: error.message })
      else res.destroy()
    })
    req.pipe(upstream)
  }

  const server: Server = createServer(async (req, res) => {
    const url = req.url ?? '/'
    const path = url.split('?')[0]!
    try {
      if (path.startsWith('/studio/') && req.method === 'POST') {
        const action = actions[path.slice('/studio/'.length)]
        if (!action) return send(res, 404, { error: 'Unknown action' })
        return send(res, 200, await action(await readBody(req)))
      }
      if (path.startsWith('/studio/shot/') && req.method === 'GET') return await serveShot(res, path)
      if (path.startsWith('/p/')) return proxy(req, res)
      if (path === '/' || path === '') {
        res.writeHead(302, { location: '/console/' })
        return res.end()
      }
      if (path.startsWith('/console')) return await serveConsole(req, res, path)
      send(res, 404, { error: 'Not found' })
    } catch (error) {
      send(res, 400, { error: (error as Error).message })
    }
  })

  server.on('upgrade', (req, socket, head) => {
    const found = target(req.url ?? '')
    if (!found) return socket.destroy()
    const upstream = connect(found.running.port, '127.0.0.1', () => {
      const headers = { ...req.headers, [STUDIO_HEADER]: found.running.token }
      upstream.write(
        `${req.method} ${found.path} HTTP/1.1\r\n` +
          Object.entries(headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\r\n') +
          '\r\n\r\n'
      )
      upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })

  await new Promise<void>((done) => server.listen(options.port ?? 4300, options.host ?? '127.0.0.1', done))
  const { port } = server.address() as { port: number }
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    projects,
    close: () =>
      new Promise<void>((done) => {
        projects.closeAll()
        server.close(() => done())
      }),
  }
}
