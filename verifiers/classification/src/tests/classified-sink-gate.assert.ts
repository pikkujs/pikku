/**
 * Verifies PKU953 and PKU954 end-to-end through the real CLI: a vault secret
 * that is revealed and then written to a sink is reported, and so is a PII
 * column written to a sink that leaves the operator's control.
 *
 * This is the half of the `SecretValue` design the type system cannot cover.
 * `SecretValue` is nominally typed, so it never reaches a sink by accident —
 * but `.reveal()` is the deliberate escape hatch, and a revealed value is an
 * ordinary `string` as far as every sink signature is concerned. The inspector
 * scan is what closes that gap, so it is exercised here against real
 * `@pikku/core` services rather than stand-in types.
 *
 * Like the PII gate, the scan is opt-in behind `--security`, and it reports at
 * `error` severity: `pikku all --security` still exits 0 so the dev server keeps
 * starting, while `--fail-on-error` turns the same finding into a blocking
 * non-zero exit.
 *
 * The temp project is created *inside the repo tree* so `@pikku/core` resolves
 * via upward node_modules traversal.
 */

import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const PIKKU_BIN = join(
  import.meta.dirname!,
  '../../../../packages/cli/dist/bin/pikku.js'
)

const TMP_PARENT = join(import.meta.dirname!, '..', '..')

function runPikkuAll(
  dir: string,
  extraArgs: string[] = []
): { exitCode: number; output: string } {
  const res = spawnSync(
    'node',
    [PIKKU_BIN, 'all', '--security', ...extraArgs],
    {
      cwd: dir,
      timeout: 60_000,
      encoding: 'utf8',
    }
  )
  return {
    exitCode: res.status ?? 1,
    output: (res.stdout ?? '') + (res.stderr ?? ''),
  }
}

const SERVICES_SRC = `
import type {
  CoreConfig,
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
  CreateConfig,
  CreateSingletonServices,
  CreateWireServices,
} from '@pikku/core/types'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'

export interface Config extends CoreConfig {}
export interface UserSession extends CoreUserSession {}
export interface SingletonServices extends CoreSingletonServices<Config> {}
export interface Services extends CoreServices<SingletonServices> {}

export const createConfig: CreateConfig<Config> = async () => ({})

export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (config) => {
  const variables = new LocalVariablesService()
  return {
    config,
    logger: new ConsoleLogger(),
    variables,
    secrets: new LocalSecretService(variables),
    schema: {} as any,
  }
}

export const createWireServices: CreateWireServices<
  SingletonServices,
  Services,
  UserSession
> = async () => ({})
`

async function createProject(functionSource: string): Promise<string> {
  const dir = await mkdtemp(join(TMP_PARENT, '.tmp-classified-sink-'))
  await writeFile(
    join(dir, 'pikku.config.json'),
    JSON.stringify({
      srcDirectories: ['./src'],
      outDir: './.pikku',
      tsconfig: './tsconfig.json',
    })
  )
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['src', '.pikku'],
    })
  )
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'src', 'services.ts'), SERVICES_SRC)
  await writeFile(join(dir, 'src', 'funcs.ts'), functionSource)
  return dir
}

// Reveals a vault secret and logs it. Every signature here is satisfied — a
// revealed secret is a plain string — which is exactly why the scan must exist.
//
// Services are annotated explicitly because this scaffold calls the raw core
// factory rather than the generated `#pikku` one; without the annotation the
// inspector's program infers `any` and no receiver resolves to a core sink.
const LEAKY_FUNC = `
import { pikkuSessionlessFunc } from '@pikku/core'
import type { Services } from './services.js'

export const dumpToken = pikkuSessionlessFunc({
  func: async ({ logger, secrets, audit }: Services) => {
    const token = await secrets.getSecret('API_KEY')
    logger.info({ msg: 'using token', token: token.reveal() })
    await audit?.audit({
      type: 'token.used',
      source: 'explicit',
      occurredAt: new Date().toISOString(),
      input: { token: token.reveal() },
    })
    return { ok: true }
  }
})
`

// Reveals the same secret and hands it to the client that needs it. Nothing is
// written out, so the scan must stay quiet.
const CLEAN_FUNC = `
import { pikkuSessionlessFunc } from '@pikku/core'
import type { Services } from './services.js'

declare function authenticate(token: string): Promise<boolean>

export const useToken = pikkuSessionlessFunc({
  func: async ({ logger, secrets }: Services) => {
    const token = await secrets.getSecret('API_KEY')
    const ok = await authenticate(token.reveal())
    logger.info('authenticated')
    return { ok }
  }
})
`

describe('PKU953 — a revealed secret written to a sink', () => {
  test('is reported, without blocking the dev server', async () => {
    const dir = await createProject(LEAKY_FUNC)
    try {
      const { exitCode, output } = runPikkuAll(dir)
      assert.match(output, /PKU953/)
      assert.match(output, /logger\.info/)
      assert.match(output, /audit\.audit/)
      assert.equal(
        exitCode,
        0,
        'the finding is an error, not a critical — `pikku all` still exits 0'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('blocks the build under --fail-on-error', async () => {
    const dir = await createProject(LEAKY_FUNC)
    try {
      const { exitCode, output } = runPikkuAll(dir, ['--fail-on-error'])
      assert.match(output, /PKU953/)
      assert.notEqual(exitCode, 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('stays quiet when the revealed secret only reaches its client', async () => {
    const dir = await createProject(CLEAN_FUNC)
    try {
      const { output } = runPikkuAll(dir)
      assert.doesNotMatch(output, /PKU953/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('does not run without --security', async () => {
    const dir = await createProject(LEAKY_FUNC)
    try {
      const res = spawnSync('node', [PIKKU_BIN, 'all'], {
        cwd: dir,
        timeout: 60_000,
        encoding: 'utf8',
      })
      const output = (res.stdout ?? '') + (res.stderr ?? '')
      assert.doesNotMatch(output, /PKU953/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

// A PII column read out of the database and logged. Nothing here is a secret —
// `email` is an ordinary string that happens to name a person — so only the
// classification brand distinguishes it from any other field.
const PII_LOG_FUNC = `
import { pikkuSessionlessFunc } from '@pikku/core'
import type { Pii } from '@pikku/core/classification'
import type { Services } from './services.js'

declare function loadShopper(): Promise<{
  shopperId: string
  email: Pii<string>
}>

export const greetShopper = pikkuSessionlessFunc({
  func: async ({ logger }: Services) => {
    const shopper = await loadShopper()
    logger.info({ msg: 'greeting shopper', email: shopper.email })
    return { ok: true }
  }
})
`

// The same column written to the audit, which lives in the operator's own
// database and is usually the legal requirement rather than a breach of it,
// alongside a log line carrying only the id. The scan must stay quiet.
const PII_AUDIT_FUNC = `
import { pikkuSessionlessFunc } from '@pikku/core'
import type { Pii } from '@pikku/core/classification'
import type { Services } from './services.js'

declare function loadShopper(): Promise<{
  shopperId: string
  email: Pii<string>
}>

export const recordView = pikkuSessionlessFunc({
  func: async ({ logger, audit }: Services) => {
    const shopper = await loadShopper()
    await audit?.audit({
      type: 'shopper.viewed',
      source: 'explicit',
      occurredAt: new Date().toISOString(),
      input: { email: shopper.email },
    })
    logger.info('shopper viewed', { shopperId: shopper.shopperId })
    return { ok: true }
  }
})
`

describe('PKU954 — personal data written to a sink', () => {
  test('is reported when it is logged', async () => {
    const dir = await createProject(PII_LOG_FUNC)
    try {
      const { exitCode, output } = runPikkuAll(dir)
      assert.match(output, /PKU954/)
      assert.match(output, /logger\.info/)
      assert.doesNotMatch(output, /PKU953/)
      assert.equal(
        exitCode,
        0,
        'the finding is an error, not a critical — `pikku all` still exits 0'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('blocks the build under --fail-on-error', async () => {
    const dir = await createProject(PII_LOG_FUNC)
    try {
      const { exitCode, output } = runPikkuAll(dir, ['--fail-on-error'])
      assert.match(output, /PKU954/)
      assert.notEqual(exitCode, 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("stays quiet for an audit, which stays in the operator's own database", async () => {
    const dir = await createProject(PII_AUDIT_FUNC)
    try {
      const { output } = runPikkuAll(dir)
      assert.doesNotMatch(output, /PKU954/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('does not run without --security', async () => {
    const dir = await createProject(PII_LOG_FUNC)
    try {
      const res = spawnSync('node', [PIKKU_BIN, 'all'], {
        cwd: dir,
        timeout: 60_000,
        encoding: 'utf8',
      })
      const output = (res.stdout ?? '') + (res.stderr ?? '')
      assert.doesNotMatch(output, /PKU954/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
