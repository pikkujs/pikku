import { spawn } from 'node:child_process'
import { existsSync, createWriteStream } from 'node:fs'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import {
  findProjectRoot,
  readJsonSafe,
} from '../../functions/validate/workspace-validate.js'
import { headSha, isWorkingTreeClean } from '../lib/git.js'
import { added, changed, dim, removed } from '../lib/output.js'

const DEFAULT_YARN_VERSION = 'yarn@4.9.2'
const DEFAULT_STEP_TIMEOUT_SECONDS = 300
const DEFAULT_STARTUP_TIMEOUT_SECONDS = 60
const DEV_LOG_TAIL_BYTES = 16_000

const SmokeStepSchema = z.object({
  name: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  durationMs: z.number().int().nonnegative(),
  detail: z.string().optional(),
  command: z.string().optional(),
})

export const FabricSmokeInput = z.object({
  keepTemp: z.boolean().optional(),
  timeoutSeconds: z.number().int().positive().optional(),
  startupTimeoutSeconds: z.number().int().positive().optional(),
  port: z.number().int().positive().optional(),
})

export const FabricSmokeOutput = z.object({
  ok: z.boolean(),
  root: z.string(),
  ref: z.string(),
  tempDir: z.string(),
  tempDirKept: z.boolean(),
  notes: z.array(z.string()),
  steps: z.array(SmokeStepSchema),
  failure: z.string().optional(),
  logTail: z.string().optional(),
})

type SmokeStep = z.infer<typeof SmokeStepSchema>

type RootPackageJson = {
  packageManager?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  resolutions?: Record<string, string>
}

type FrontendConfig = {
  cwd?: string
  dev?: {
    command?: string[]
    port?: number
    healthPath?: string
  }
}

type FabricConfig = {
  frontends?: Record<string, FrontendConfig>
}

type StepResult = {
  ok: boolean
  durationMs: number
  tail: string
  timedOut: boolean
}

function now(): number {
  return Date.now()
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`
}

function truncateTail(text: string, maxBytes = DEV_LOG_TAIL_BYTES): string {
  const trimmed = text.trim()
  if (Buffer.byteLength(trimmed, 'utf8') <= maxBytes) {
    return trimmed
  }

  const slice = Buffer.from(trimmed, 'utf8').subarray(-maxBytes).toString('utf8')
  const newlineIndex = slice.indexOf('\n')
  return newlineIndex === -1 ? slice : slice.slice(newlineIndex + 1)
}

function commandLabel(command: string, args: string[]): string {
  return [command, ...args].join(' ')
}

async function runCommandStep(args: {
  name: string
  command: string
  commandArgs: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
  timeoutMs: number
}): Promise<StepResult> {
  const startedAt = now()
  return await new Promise((resolvePromise) => {
    const child = spawn(args.command, args.commandArgs, {
      cwd: args.cwd,
      env: args.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let combined = ''
    let timedOut = false

    const append = (chunk: string) => {
      combined += chunk
      if (combined.length > DEV_LOG_TAIL_BYTES * 4) {
        combined = combined.slice(-DEV_LOG_TAIL_BYTES * 4)
      }
    }

    child.stdout.on('data', (chunk) => append(chunk.toString()))
    child.stderr.on('data', (chunk) => append(chunk.toString()))
    child.on('error', (error) => append(String(error)))

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2000).unref()
    }, args.timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timeout)
      resolvePromise({
        ok: code === 0 && !timedOut,
        durationMs: now() - startedAt,
        tail: truncateTail(combined),
        timedOut,
      })
    })
  })
}

async function waitForHealth(args: {
  urls: string[]
  timeoutMs: number
  child: ReturnType<typeof spawn>
  logFile: string
}): Promise<{ ok: boolean; tail: string; detail: string }> {
  const startedAt = now()
  const fastFailAt = startedAt + 25_000

  while (now() - startedAt < args.timeoutMs) {
    if (args.child.exitCode !== null) {
      const tail = await readLogTail(args.logFile)
      return {
        ok: false,
        tail,
        detail: `pikku dev exited before health-check became ready`,
      }
    }

    try {
      for (const url of args.urls) {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(2_000),
        })
        if (response.status !== 0) {
          return {
            ok: true,
            tail: '',
            detail: `${url} responded ${response.status}`,
          }
        }
      }
    } catch {
      // keep polling
    }

    if (now() >= fastFailAt) {
      const tail = await readLogTail(args.logFile)
      if (/error TS|SyntaxError|Cannot find|Error:/i.test(tail)) {
        return {
          ok: false,
          tail,
          detail: 'pikku dev failed to start — error detected in startup log',
        }
      }
    }

    await delay(1000)
  }

  const tail = await readLogTail(args.logFile)
  return {
    ok: false,
    tail,
    detail: `pikku dev did not become healthy within ${Math.ceil(
      args.timeoutMs / 1000
    )}s`,
  }
}

function rewriteFrontendCommand(
  command: string[]
): { command: string; args: string[] } {
  if (command.length === 0) {
    throw new Error('frontend dev.command must not be empty')
  }

  if (command[0] === 'yarn') {
    return {
      command: 'yarn',
      args: command.slice(1),
    }
  }

  return {
    command: command[0],
    args: command.slice(1),
  }
}

function startManagedProcess(args: {
  command: string
  commandArgs: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  logFile: string
}) {
  const logStream = createWriteStream(args.logFile, { flags: 'w' })
  const child = spawn(args.command, args.commandArgs, {
    cwd: args.cwd,
    env: args.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)

  return { child, logStream }
}

async function readLogTail(path: string): Promise<string> {
  if (!existsSync(path)) return ''
  try {
    return truncateTail(await readFile(path, 'utf8'))
  } catch {
    return ''
  }
}

async function terminateProcessGroup(child: ReturnType<typeof spawn>) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await delay(1000)
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

async function runFrontendChecks(args: {
  root: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  steps: SmokeStep[]
}): Promise<{ ok: boolean; failure?: string; logTail?: string }> {
  const fabricConfigPath = existsSync(join(args.root, 'pikkufabric.config.json'))
    ? join(args.root, 'pikkufabric.config.json')
    : join(args.root, 'fabric.config.json')

  const fabricConfig = await readJsonSafe<FabricConfig>(fabricConfigPath)
  const frontends = fabricConfig?.frontends ?? {}
  const entries = Object.entries(frontends).filter(
    (entry): entry is [string, FrontendConfig] =>
      Boolean(entry[1]) && typeof entry[1] === 'object'
  )

  if (entries.length === 0) {
    args.steps.push({
      name: 'frontend checks',
      status: 'skipped',
      durationMs: 0,
      detail: 'no frontends declared in pikkufabric.config.json',
    })
    return { ok: true }
  }

  for (const [slug, config] of entries) {
    const cwd = typeof config.cwd === 'string' && config.cwd.length > 0
      ? resolve(args.root, config.cwd)
      : null

    if (!cwd || !existsSync(cwd) || !existsSync(join(cwd, 'package.json'))) {
      args.steps.push({
        name: `frontend:${slug}`,
        status: 'skipped',
        durationMs: 0,
        detail: `skipping ${slug} — invalid or missing cwd`,
      })
      continue
    }

    const pkg = await readJsonSafe<{ scripts?: Record<string, string> }>(
      join(cwd, 'package.json')
    )
    const scripts = pkg?.scripts ?? {}
    const scriptOrder = ['i18n', 'build', 'tsc'].filter(
      (name) => typeof scripts[name] === 'string'
    )

    if (scriptOrder.length === 0) {
      args.steps.push({
        name: `frontend:${slug}`,
        status: 'skipped',
        durationMs: 0,
        detail: `no i18n/build/tsc scripts in ${relative(args.root, cwd)}`,
      })
      continue
    }

    for (const script of scriptOrder) {
      const result = await runCommandStep({
        name: `frontend:${slug}:${script}`,
        command: 'yarn',
        commandArgs: [script],
        cwd,
        env: args.env,
        timeoutMs: args.timeoutMs,
      })
      args.steps.push({
        name: `frontend:${slug}:${script}`,
        status: result.ok ? 'passed' : 'failed',
        durationMs: result.durationMs,
        detail: result.ok
          ? `${slug} ${script} passed`
          : `${slug} ${script} failed`,
        command: commandLabel('yarn', [script]),
      })

      if (!result.ok) {
        return {
          ok: false,
          failure: `${slug} ${script} failed`,
          logTail: result.tail,
        }
      }
    }
  }

  return { ok: true }
}

async function startFrontends(args: {
  root: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  steps: SmokeStep[]
}) {
  const fabricConfigPath = existsSync(join(args.root, 'pikkufabric.config.json'))
    ? join(args.root, 'pikkufabric.config.json')
    : join(args.root, 'fabric.config.json')

  const fabricConfig = await readJsonSafe<FabricConfig>(fabricConfigPath)
  const frontends = fabricConfig?.frontends ?? {}
  const entries = Object.entries(frontends).filter(
    (entry): entry is [string, FrontendConfig] =>
      Boolean(entry[1]) && typeof entry[1] === 'object'
  )

  const running: Array<{
    slug: string
    child: ReturnType<typeof spawn>
    logStream: ReturnType<typeof createWriteStream>
  }> = []

  if (entries.length === 0) {
    args.steps.push({
      name: 'frontend startup',
      status: 'skipped',
      durationMs: 0,
      detail: 'no frontends declared in pikkufabric.config.json',
    })
    return { ok: true as const, running }
  }

  for (const [slug, config] of entries) {
    const cwd =
      typeof config.cwd === 'string' && config.cwd.length > 0
        ? resolve(args.root, config.cwd)
        : null
    const devConfig = config.dev

    if (!cwd || !existsSync(cwd)) {
      args.steps.push({
        name: `frontend:${slug}:start`,
        status: 'failed',
        durationMs: 0,
        detail: `frontend cwd is missing: ${config.cwd ?? '(unset)'}`,
      })
      return {
        ok: false as const,
        running,
        failure: `${slug} frontend cwd is missing`,
        logTail: '',
      }
    }

    if (
      !devConfig ||
      !Array.isArray(devConfig.command) ||
      devConfig.command.length === 0 ||
      typeof devConfig.port !== 'number'
    ) {
      args.steps.push({
        name: `frontend:${slug}:start`,
        status: 'failed',
        durationMs: 0,
        detail: `frontend dev config is incomplete in ${relative(args.root, fabricConfigPath)}`,
      })
      return {
        ok: false as const,
        running,
        failure: `${slug} frontend dev config is incomplete`,
        logTail: '',
      }
    }

    const rewritten = rewriteFrontendCommand(devConfig.command)
    const healthPath =
      typeof devConfig.healthPath === 'string' && devConfig.healthPath.length > 0
        ? devConfig.healthPath
        : '/'
    const normalizedHealthPath = healthPath.startsWith('/')
      ? healthPath
      : `/${healthPath}`
    const logFile = join(args.root, `.pikku-fabric-smoke-${slug}.log`)

    const startedAt = now()
    const managed = startManagedProcess({
      command: rewritten.command,
      commandArgs: rewritten.args,
      cwd,
      env: args.env,
      logFile,
    })
    running.push({ slug, child: managed.child, logStream: managed.logStream })

    const healthResult = await waitForHealth({
      urls: [
        `http://localhost:${devConfig.port}${normalizedHealthPath}`,
        `http://127.0.0.1:${devConfig.port}${normalizedHealthPath}`,
      ],
      timeoutMs: args.timeoutMs,
      child: managed.child,
      logFile,
    })

    args.steps.push({
      name: `frontend:${slug}:start`,
      status: healthResult.ok ? 'passed' : 'failed',
      durationMs: now() - startedAt,
      detail: healthResult.detail,
      command: commandLabel(rewritten.command, rewritten.args),
    })

    if (!healthResult.ok) {
      return {
        ok: false as const,
        running,
        failure: `${slug} frontend failed to start`,
        logTail: healthResult.tail,
      }
    }
  }

  return { ok: true as const, running }
}

function resolvePikkuBin(): string {
  const fromArgv = process.argv[1]
  if (fromArgv && existsSync(fromArgv)) {
    return fromArgv
  }

  return fileURLToPath(new URL('../../../bin/pikku.js', import.meta.url))
}

function resolveCurrentCliPackageRoot(pikkuBin: string): string {
  return resolve(pikkuBin, '../../..')
}

async function vendorCurrentCliPackage(args: {
  tempRoot: string
  currentCliPackageRoot: string
  timeoutMs: number
}): Promise<{
  durationMs: number
  tarballRelativePath?: string
  detail: string
  errorTail?: string
}> {
  const startedAt = now()
  const vendorDir = join(args.tempRoot, '.pikku-fabric-smoke', 'vendor')
  await mkdir(vendorDir, { recursive: true })

  const cliPackageRoot = await realpath(args.currentCliPackageRoot).catch(
    () => args.currentCliPackageRoot
  )
  const packStep = await runCommandStep({
    name: 'vendor @pikku/cli',
    command: 'npm',
    commandArgs: ['pack', cliPackageRoot, '--pack-destination', vendorDir],
    cwd: args.tempRoot,
    env: process.env,
    timeoutMs: args.timeoutMs,
  })

  if (!packStep.ok) {
    return {
      durationMs: now() - startedAt,
      detail: 'npm pack failed for @pikku/cli',
      errorTail: packStep.tail || 'npm pack failed for @pikku/cli',
    }
  }

  const tarballName = packStep.tail
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)

  if (!tarballName?.endsWith('.tgz')) {
    return {
      durationMs: now() - startedAt,
      detail: 'npm pack did not return a tarball name',
      errorTail: packStep.tail || '(empty)',
    }
  }

  const tarballRelativePath = relative(
    args.tempRoot,
    join(vendorDir, tarballName)
  )

  return {
    durationMs: now() - startedAt,
    tarballRelativePath,
    detail: `packed ${relative(args.tempRoot, cliPackageRoot)} -> ${tarballRelativePath}`,
  }
}

async function rewriteLocalPikkuDependencies(args: {
  root: string
  cliTarballRelativePath: string
}): Promise<string[]> {
  const packageJsonPath = join(args.root, 'package.json')
  const packageJson = await readJsonSafe<RootPackageJson>(packageJsonPath)
  if (!packageJson) return []

  const rewrites: string[] = []
  const rewriteMap = (
    dependencies: Record<string, string> | undefined,
    label: string
  ) => {
    if (!dependencies) return

    const current = dependencies['@pikku/cli']
    if (typeof current !== 'string' || !current.startsWith('file:')) {
      return
    }

    dependencies['@pikku/cli'] = `file:${args.cliTarballRelativePath}`
    rewrites.push(
      `${label}.@pikku/cli: ${current} -> file:${args.cliTarballRelativePath}`
    )
  }

  rewriteMap(packageJson.dependencies, 'dependencies')
  rewriteMap(packageJson.devDependencies, 'devDependencies')

  if (rewrites.length === 0) {
    return rewrites
  }

  await writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf8'
  )

  return rewrites
}

async function createTempWorktree(root: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'pikku-fabric-smoke-'))
  const step = await runCommandStep({
    name: 'git worktree add',
    command: 'git',
    commandArgs: ['worktree', 'add', '--detach', tempDir, 'HEAD'],
    cwd: root,
    timeoutMs: 60_000,
  })

  if (step.ok) {
    return tempDir
  }

  const cloneStep = await runCommandStep({
    name: 'git clone',
    command: 'git',
    commandArgs: ['clone', '--shared', root, tempDir],
    cwd: root,
    timeoutMs: 60_000,
  })
  if (!cloneStep.ok) {
    throw new Error(
      `Failed to create temp checkout.\nworktree: ${step.tail || 'git worktree add failed.'}\nclone: ${cloneStep.tail || 'git clone failed.'}`
    )
  }

  const detachStep = await runCommandStep({
    name: 'git checkout --detach',
    command: 'git',
    commandArgs: ['checkout', '--detach', 'HEAD'],
    cwd: tempDir,
    timeoutMs: 60_000,
  })
  if (!detachStep.ok) {
    throw new Error(
      `Failed to detach temp checkout.\n${detachStep.tail || 'git checkout --detach failed.'}`
    )
  }

  return tempDir
}

async function removeTempWorktree(root: string, tempDir: string) {
  await runCommandStep({
    name: 'git worktree remove',
    command: 'git',
    commandArgs: ['worktree', 'remove', '--force', tempDir],
    cwd: root,
    timeoutMs: 60_000,
  })
  await rm(tempDir, { recursive: true, force: true }).catch(() => {})
}

async function stopManagedProcesses(
  running: Array<{
    slug: string
    child: ReturnType<typeof spawn>
    logStream: ReturnType<typeof createWriteStream>
  }>
) {
  for (const processHandle of running) {
    await terminateProcessGroup(processHandle.child).catch(() => {})
    processHandle.logStream.end()
  }
}

async function pickPort(preferred?: number): Promise<number> {
  if (preferred) return preferred

  return await new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free port')))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) reject(error)
        else resolvePromise(port)
      })
    })
    server.on('error', reject)
  })
}

function hasMigrations(root: string): boolean {
  return (
    existsSync(join(root, 'db', 'sqlite')) ||
    existsSync(join(root, 'db', 'postgres'))
  )
}

export const FabricSmoke = pikkuSessionlessFunc({
  description:
    'Run a clean-room Fabric smoke test: temp worktree, install, bootstrap, codegen, frontend checks, migrate, and pikku dev startup.',
  input: FabricSmokeInput,
  output: FabricSmokeOutput,
  func: async (_services, input) => {
    const root = await findProjectRoot(process.cwd())
    const ref = await headSha(root)
    const tempDir = await createTempWorktree(root)
    const keepTempRequested = input.keepTemp ?? false
    const notes: string[] = [
      'Smoke uses a detached temp worktree from HEAD, not your live working tree.',
      'Frontend runtime generation/Caddy routing is not exercised here; frontend build/typecheck and pikku dev startup are.',
    ]
    const steps: SmokeStep[] = []
    const stepTimeoutMs =
      (input.timeoutSeconds ?? DEFAULT_STEP_TIMEOUT_SECONDS) * 1000
    const startupTimeoutMs =
      (input.startupTimeoutSeconds ?? DEFAULT_STARTUP_TIMEOUT_SECONDS) * 1000
    const port = await pickPort(input.port)
    const packageJson = await readJsonSafe<RootPackageJson>(
      join(tempDir, 'package.json')
    )
    const packageManager = packageJson?.packageManager ?? DEFAULT_YARN_VERSION
    const pikkuBin = resolvePikkuBin()
    const currentCliPackageRoot = resolveCurrentCliPackageRoot(pikkuBin)
    const env = {
      ...process.env,
      PIKKU_DEV_DIR: tempDir,
    }

    if (!(await isWorkingTreeClean(root))) {
      notes.push(
        'Your source worktree has uncommitted changes; this smoke run used committed HEAD only.'
      )
    }

    if (!packageManager.startsWith('yarn@')) {
      const result = {
        ok: false,
        root,
        ref,
        tempDir,
        tempDirKept: true,
        notes,
        steps,
        failure: `Unsupported packageManager for Fabric smoke: ${packageManager}`,
        logTail:
          'Fabric smoke expects package.json to declare a Yarn packageManager like "yarn@4.9.2".',
      }
      process.exitCode = 1
      return result
    }

    let tempDirKept = true
    let failure: string | undefined
    let logTail: string | undefined
    let devChild: ReturnType<typeof spawn> | null = null
    const runningFrontends: Array<{
      slug: string
      child: ReturnType<typeof spawn>
      logStream: ReturnType<typeof createWriteStream>
    }> = []

    try {
      const vendoredCli = await vendorCurrentCliPackage({
        tempRoot: tempDir,
        currentCliPackageRoot,
        timeoutMs: stepTimeoutMs,
      })
      steps.push({
        name: 'vendor @pikku/cli',
        status: vendoredCli.tarballRelativePath ? 'passed' : 'failed',
        durationMs: vendoredCli.durationMs,
        detail: vendoredCli.detail,
      })
      if (!vendoredCli.tarballRelativePath) {
        failure = 'vendor @pikku/cli'
        logTail = vendoredCli.errorTail
        process.exitCode = 1
        return {
          ok: false,
          root,
          ref,
          tempDir,
          tempDirKept,
          notes,
          steps,
          failure,
          logTail,
        }
      }

      const localDependencyRewrites = await rewriteLocalPikkuDependencies({
        root: tempDir,
        cliTarballRelativePath: vendoredCli.tarballRelativePath,
      })
      if (localDependencyRewrites.length > 0) {
        steps.push({
          name: 'rewrite local Pikku dependencies',
          status: 'passed',
          durationMs: 0,
          detail: localDependencyRewrites.join('; '),
        })
      }

      for (const step of [
        {
          name: 'yarn install',
          command: 'yarn',
          commandArgs: ['install', '--mode=skip-build'],
        },
        {
          name: 'pikku bootstrap',
          command: process.execPath,
          commandArgs: [pikkuBin, 'bootstrap'],
        },
        {
          name: 'pikku all',
          command: process.execPath,
          commandArgs: [pikkuBin, 'all'],
        },
      ]) {
        const result = await runCommandStep({
          name: step.name,
          command: step.command,
          commandArgs: step.commandArgs,
          cwd: tempDir,
          env,
          timeoutMs: stepTimeoutMs,
        })
        steps.push({
          name: step.name,
          status: result.ok ? 'passed' : 'failed',
          durationMs: result.durationMs,
          detail: result.ok
            ? `${step.name} passed`
            : result.timedOut
              ? `${step.name} timed out`
              : `${step.name} failed`,
          command: commandLabel(step.command, step.commandArgs),
        })

        if (!result.ok) {
          failure = step.name
          logTail = result.tail
          process.exitCode = 1
          return {
            ok: false,
            root,
            ref,
            tempDir,
            tempDirKept,
            notes,
            steps,
            failure,
            logTail,
          }
        }
      }

      const frontendResult = await runFrontendChecks({
        root: tempDir,
        env,
        timeoutMs: stepTimeoutMs,
        steps,
      })
      if (!frontendResult.ok) {
        failure = frontendResult.failure
        logTail = frontendResult.logTail
        process.exitCode = 1
        return {
          ok: false,
          root,
          ref,
          tempDir,
          tempDirKept,
          notes,
          steps,
          failure,
          logTail,
        }
      }

      if (hasMigrations(tempDir)) {
        const result = await runCommandStep({
          name: 'pikku db migrate',
          command: process.execPath,
          commandArgs: [pikkuBin, 'db', 'migrate'],
          cwd: tempDir,
          env,
          timeoutMs: stepTimeoutMs,
        })
        steps.push({
          name: 'pikku db migrate',
          status: result.ok ? 'passed' : 'failed',
          durationMs: result.durationMs,
          detail: result.ok
            ? 'database migrations passed'
            : result.timedOut
              ? 'database migrations timed out'
              : 'database migrations failed',
          command: commandLabel(process.execPath, [pikkuBin, 'db', 'migrate']),
        })
        if (!result.ok) {
          failure = 'pikku db migrate'
          logTail = result.tail
          process.exitCode = 1
          return {
            ok: false,
            root,
            ref,
            tempDir,
            tempDirKept,
            notes,
            steps,
            failure,
            logTail,
          }
        }
      } else {
        steps.push({
          name: 'pikku db migrate',
          status: 'skipped',
          durationMs: 0,
          detail: 'no db/sqlite or db/postgres directory found',
        })
      }

      const devLogFile = join(tempDir, '.pikku-fabric-smoke-dev.log')
      const logStream = createWriteStream(devLogFile, { flags: 'w' })
      devChild = spawn(
        process.execPath,
        [pikkuBin, 'dev', '--hostname', 'localhost', '--port', String(port)],
        {
          cwd: tempDir,
          env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      devChild.stdout?.pipe(logStream)
      devChild.stderr?.pipe(logStream)

      const startupStartedAt = now()
      const healthResult = await waitForHealth({
        urls: [
          `http://localhost:${port}/health-check`,
          `http://127.0.0.1:${port}/health-check`,
        ],
        timeoutMs: startupTimeoutMs,
        child: devChild,
        logFile: devLogFile,
      })
      steps.push({
        name: 'pikku dev startup',
        status: healthResult.ok ? 'passed' : 'failed',
        durationMs: now() - startupStartedAt,
        detail: healthResult.detail,
        command: commandLabel(process.execPath, [
          pikkuBin,
          'dev',
          '--hostname',
          'localhost',
          '--port',
          String(port),
        ]),
      })

      await terminateProcessGroup(devChild)
      logStream.end()
      devChild = null

      if (!healthResult.ok) {
        failure = 'pikku dev startup'
        logTail = healthResult.tail
        process.exitCode = 1
        return {
          ok: false,
          root,
          ref,
          tempDir,
          tempDirKept,
          notes,
          steps,
          failure,
          logTail,
        }
      }

      const frontendStartResult = await startFrontends({
        root: tempDir,
        env,
        timeoutMs: startupTimeoutMs,
        steps,
      })
      runningFrontends.push(...frontendStartResult.running)
      if (!frontendStartResult.ok) {
        failure = frontendStartResult.failure
        logTail = frontendStartResult.logTail
        process.exitCode = 1
        return {
          ok: false,
          root,
          ref,
          tempDir,
          tempDirKept,
          notes,
          steps,
          failure,
          logTail,
        }
      }

      if (!keepTempRequested) {
        await stopManagedProcesses(runningFrontends)
        await removeTempWorktree(root, tempDir)
        tempDirKept = false
      }

      return {
        ok: true,
        root,
        ref,
        tempDir,
        tempDirKept,
        notes,
        steps,
      }
    } finally {
      await stopManagedProcesses(runningFrontends).catch(() => {})
      if (devChild) {
        await terminateProcessGroup(devChild).catch(() => {})
      }
      if (!failure && !keepTempRequested && tempDirKept) {
        await removeTempWorktree(root, tempDir).catch(() => {})
        tempDirKept = false
      }
    }
  },
})

export const renderSmoke = (
  _services: unknown,
  output: z.infer<typeof FabricSmokeOutput>
): void => {
  if (output.ok) {
    console.log(
      `${added('passed')} ${dim(output.ref.slice(0, 8))} ${dim('·')} ${output.steps.length} steps`
    )
  } else {
    console.log(
      `${removed('failed')} ${dim(output.ref.slice(0, 8))} ${dim('·')} ${output.failure ?? 'smoke failed'}`
    )
  }

  for (const note of output.notes) {
    console.log(dim(`note: ${note}`))
  }
  console.log(dim(`temp: ${output.tempDirKept ? output.tempDir : '(removed)'}`))
  console.log()

  for (const step of output.steps) {
    const icon =
      step.status === 'passed'
        ? added('✓')
        : step.status === 'failed'
          ? removed('✗')
          : changed('•')
    const detail = step.detail ? ` ${dim(step.detail)}` : ''
    console.log(`${icon} ${step.name} ${dim(`(${formatDuration(step.durationMs)})`)}${detail}`)
    if (step.command) {
      console.log(`   ${dim(step.command)}`)
    }
  }

  if (output.logTail) {
    console.log()
    console.log(dim('log tail:'))
    console.log(output.logTail)
  }

  if (!output.ok) {
    process.exitCode = 1
  }
}
