/**
 * Builds the CMS test app with the built CLI, the way a project is built, and
 * serves it with `pikku dev`. The copy lives under the package's own
 * git-ignored `.tmp/`, where its dependencies resolve.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compilePikkuSchemas, scopeSchema } from '@pikku/addon-kysely'
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely'

export type Engine = 'sqlite' | 'postgres'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const cli = join(packageRoot, 'dist/bin/pikku.js')

export const cliIsBuilt = () => existsSync(cli)

const PACKAGE_JSON = {
  name: 'cms-test-app',
  type: 'module',
  private: true,
  dependencies: {
    '@pikku/addon-kysely': '*',
    '@pikku/addon-kysely-sqlite': '*',
    '@pikku/addon-kysely-postgres': '*',
    '@pikku/core': '*',
    '@pikku/schema-cfworker': '*',
    kysely: '*',
    zod: '*',
  },
  imports: {
    '#pikku/*.gen.js': './.pikku/*.gen.ts',
    '#pikku/*.js': './.pikku/*.ts',
    '#pikku/*': ['./.pikku/*/index.ts', './.pikku/*'],
  },
}

const SEED = `
INSERT INTO therapist (id, name) VALUES ('t-ada', 'Ada'), ('t-bo', 'Bo');
INSERT INTO offering (id, slug, title, status, body, price_minor, featured, position, therapist_id, starts_at, internal_code, owner_secret, updated_at) VALUES
  ('o-1', 'breath', 'Breath work', 'published', 'One', 1000, TRUE, 1, 't-ada', '2026-03-01 10:00:00', 'IC-1', 'SENTINEL-SECRET', '2026-01-01T00:00:00.000Z'),
  ('o-2', 'yoga-percent', '100% yoga', 'published', 'Two', 2000, FALSE, 1, 't-bo', '2026-04-01 10:00:00', 'IC-2', 'SENTINEL-SECRET', '2026-01-01T00:00:00.000Z'),
  ('o-3', 'yoga-plain', '100 yoga', 'draft', NULL, 3000, FALSE, 1, NULL, '2026-05-01 10:00:00', 'IC-3', 'SENTINEL-SECRET', '2026-01-01T00:00:00.000Z'),
  ('o-4', 'under_score', 'under_score', 'draft', NULL, 4000, TRUE, 2, NULL, NULL, 'IC-4', NULL, '2026-01-01T00:00:00.000Z'),
  ('o-5', 'underXscore', 'underXscore', 'archived', NULL, 5000, FALSE, 2, NULL, NULL, 'IC-5', NULL, '2026-01-01T00:00:00.000Z');
-- A value the CMS never wrote, which it must not sign a link to.
UPDATE offering SET image_key = 'legacy/photo.png' WHERE id = 'o-4';
INSERT INTO course_application (id, email, first_name, motivation, status, note, created_at) VALUES
  ('a-1', 'visitor@example.com', 'Vi', '<script>alert(1)</script>', 'new', NULL, '2026-02-01 09:00:00');
`

const run = (cwd: string, args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<{ code: number; output: string }>((resolve) => {
    // Async on purpose: bun's spawnSync can miss a child's exit and spin forever.
    execFile(
      'node',
      [cli, ...args],
      { cwd, env, encoding: 'utf8', timeout: 150_000, maxBuffer: 64_000_000 },
      (error, stdout, stderr) =>
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          output: stdout + stderr,
        })
    )
  })

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })

export interface Caller {
  user?: string
  /** Grants a session cache still holds, replayed instead of the stored ones. */
  cached?: string[]
  /** Sends the Studio token, or the given one in its place. */
  studio?: boolean | string
}

export interface Answer {
  status: number
  body: any
  text: string
}

export class CmsTestApp {
  readonly studioToken = randomBytes(32).toString('hex')
  private server?: ChildProcess
  private serverLog = ''
  url = ''

  private constructor(
    readonly dir: string,
    readonly engine: Engine
  ) {}

  private get env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      CI: '1',
      // Far from UTC, so a time read or written in the server's zone shows.
      TZ: 'Pacific/Auckland',
      PIKKU_STUDIO_TOKEN: this.studioToken,
    }
  }

  static async create(engine: Engine): Promise<CmsTestApp> {
    const tmp = join(packageRoot, '.tmp')
    await mkdir(tmp, { recursive: true })
    const dir = await mkdtemp(join(tmp, `cms-app-${engine}-`))
    await cp(join(packageRoot, 'test-fixtures/cms-app'), dir, {
      recursive: true,
    })
    await writeFile(join(dir, 'package.json'), JSON.stringify(PACKAGE_JSON))
    await writeFile(join(dir, 'grants.json'), '{}')
    // The validator apps use, which the CLI itself has no dependency on.
    await mkdir(join(dir, 'node_modules/@pikku'), { recursive: true })
    await symlink(
      join(packageRoot, '../services/schema-cfworker'),
      join(dir, 'node_modules/@pikku/schema-cfworker')
    )
    await mkdir(join(dir, 'db', engine), { recursive: true })
    await writeFile(join(dir, `db/${engine}-dev-seed.sql`), SEED)
    // With no sqliteDb, a db/postgres directory is an embedded Postgres.
    if (engine === 'postgres') {
      await writeFile(
        join(dir, 'src/config.ts'),
        `import { pikkuConfig } from '#pikku/setup'\n\nexport const createConfig = pikkuConfig(async () => ({}))\n`
      )
    }
    return new CmsTestApp(dir, engine)
  }

  async pikku(...args: string[]) {
    return run(this.dir, args, this.env)
  }

  async pikkuOk(...args: string[]) {
    const result = await this.pikku(...args)
    if (result.code !== 0) {
      throw new Error(
        `pikku ${args.join(' ')} failed:\n${result.output.slice(-6000)}`
      )
    }
    return result.output
  }

  /**
   * The tables stored grants live in. In an app they come with Better Auth,
   * which owns the `user` table they refer to; this one has no sign-in.
   */
  private async writeGrantTables() {
    const compiler = new Kysely<any>({
      dialect:
        this.engine === 'sqlite'
          ? {
              createAdapter: () => new SqliteAdapter(),
              createDriver: () => new DummyDriver(),
              createIntrospector: (db) => new SqliteIntrospector(db),
              createQueryCompiler: () => new SqliteQueryCompiler(),
            }
          : {
              createAdapter: () => new PostgresAdapter(),
              createDriver: () => new DummyDriver(),
              createIntrospector: (db) => new PostgresIntrospector(db),
              createQueryCompiler: () => new PostgresQueryCompiler(),
            },
    })
    await this.write(
      `db/${this.engine}/0000-grants.sql`,
      `CREATE TABLE "user" ("id" text PRIMARY KEY);\n\n${compilePikkuSchemas(compiler, [scopeSchema], { 'user.id': 'text' })}\n`
    )
  }

  /** A first build from nothing, then the strict one the tests rely on. */
  async build() {
    await this.pikkuOk('all')
    await this.pikkuOk('db', 'generate')
    await this.writeGrantTables()
    await this.pikkuOk('db', 'reset')
    return this.strictBuild()
  }

  async strictBuild() {
    return this.pikkuOk('all', '--tsc-summary', '--security', '--fail-on-error')
  }

  async read(path: string) {
    return readFile(join(this.dir, path), 'utf8')
  }

  async write(path: string, content: string) {
    await mkdir(dirname(join(this.dir, path)), { recursive: true })
    await writeFile(join(this.dir, path), content)
  }

  /** The events the app's audit sink was given. */
  async audited(): Promise<any[]> {
    if (!existsSync(join(this.dir, 'audit.jsonl'))) return []
    return (await this.read('audit.jsonl'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  }

  async grant(grants: Record<string, string[]>) {
    await this.write('grants.json', JSON.stringify(grants))
  }

  async start() {
    const port = await freePort()
    this.url = `http://127.0.0.1:${port}`
    // A group of its own, so stopping takes every process it started.
    const server = spawn(
      'node',
      [cli, 'dev', '--no-watch', '--no-frontends', '--port', String(port)],
      { cwd: this.dir, env: this.env, detached: true }
    )
    this.server = server
    for (const stream of [server.stdout, server.stderr]) {
      stream!.on('data', (chunk) => {
        this.serverLog = (this.serverLog + chunk).slice(-200_000)
      })
    }
    for (let attempt = 0; attempt < 300; attempt++) {
      if (server.exitCode !== null) break
      try {
        await fetch(`${this.url}/rpc/describeCms`, { method: 'POST' })
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
    await this.stop()
    throw new Error(`pikku dev did not answer:\n${this.serverLog.slice(-6000)}`)
  }

  get log() {
    return this.serverLog
  }

  async stop() {
    const server = this.server
    if (server?.exitCode !== null) return
    this.server = undefined
    const exited = new Promise((resolve) => server.once('exit', resolve))
    process.kill(-server.pid!, 'SIGTERM')
    await exited
  }

  async remove() {
    await this.stop()
    await rm(this.dir, { recursive: true, force: true })
  }

  headers({ user, cached, studio }: Caller): Record<string, string> {
    return {
      ...(user ? { 'x-test-user': user } : {}),
      ...(cached ? { 'x-test-cached': cached.join(',') } : {}),
      ...(studio
        ? {
            'x-pikku-studio': studio === true ? this.studioToken : studio,
          }
        : {}),
    }
  }

  async rpc(name: string, data: unknown, caller: Caller = {}): Promise<Answer> {
    const response = await fetch(`${this.url}/rpc/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.headers(caller),
      },
      body: JSON.stringify({ data }),
    })
    const text = await response.text()
    let body: any
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: response.status, body, text }
  }
}
