import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

function makeLogger() {
  const diagnostics: Array<{ code: ErrorCode; message: string }> = []
  const logger: InspectorLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => diagnostics.push({ code, message }),
    critical: (code, message) => diagnostics.push({ code, message }),
    hasCriticalErrors: () => diagnostics.length > 0,
  }
  return { logger, diagnostics }
}

/**
 * Stands in for @pikku/core, which is not importable from a tmp dir. The shapes
 * are what matters: `Secret<T>` is the optional brand `.reveal()` returns, and
 * the service interfaces are matched by name, so these must keep the real names.
 */
const PRELUDE = `
type Secret<T> = T & { readonly __classification__?: 'secret' }

declare class SecretValue<T = string> {
  private brand: T
  reveal(): Secret<T>
}

interface Logger {
  info(messageOrObj: any, ...meta: any[]): void
  error(messageOrObj: any, ...meta: any[]): void
}
interface QueueService {
  add<T>(queueName: string, data: T): Promise<string>
}
interface EmailService {
  send(input: any): Promise<void>
}
interface WebhookService {
  send(input: any): Promise<void>
}

type Services = {
  logger: Logger
  queueService: QueueService
  email: EmailService
  webhooks: WebhookService
  secrets: { getSecret(key: string): Promise<SecretValue<string>> }
}

declare const pikkuFunc: <In, Out>(cfg: {
  func: (services: Services, data: In) => Promise<Out>
}) => unknown
`

async function runInspect(source: string) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'pikku-secret-sink-test-'))
  const file = join(tmpDir, 'funcs.ts')
  await writeFile(file, PRELUDE + source)
  const { logger, diagnostics } = makeLogger()
  try {
    await inspect(logger, [file], { rootDir: tmpDir, classificationCheck: true })
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
  return diagnostics
}

const sinkErrors = (diagnostics: Array<{ code: ErrorCode; message: string }>) =>
  diagnostics.filter((d) => d.code === ErrorCode.SECRET_REVEALED_INTO_SINK)

describe('PKU953 — a revealed secret reaching a sink', () => {
  test('flags a secret logged inline', async () => {
    const diagnostics = await runInspect(`
      export const leak = pikkuFunc<void, void>({
        func: async ({ logger, secrets }) => {
          const token = await secrets.getSecret('API_KEY')
          logger.info(token.reveal())
        },
      })
    `)
    const errors = sinkErrors(diagnostics)
    assert.equal(errors.length, 1)
    assert.match(errors[0]!.message, /logger\.info/)
  })

  test('flags a secret that reaches the sink through a local binding', async () => {
    const diagnostics = await runInspect(`
      export const leak = pikkuFunc<void, void>({
        func: async ({ logger, secrets }) => {
          const token = (await secrets.getSecret('API_KEY')).reveal()
          logger.error('auth failed', { token })
        },
      })
    `)
    const errors = sinkErrors(diagnostics)
    assert.equal(errors.length, 1)
    assert.match(errors[0]!.message, /logger\.error/)
    assert.match(errors[0]!.message, /token/)
  })

  test('flags a secret enqueued, emailed or sent to a webhook', async () => {
    const diagnostics = await runInspect(`
      export const leak = pikkuFunc<void, void>({
        func: async ({ queueService, email, webhooks, secrets }) => {
          const token = (await secrets.getSecret('API_KEY')).reveal()
          await queueService.add('jobs', { token })
          await email.send({ to: 'a@b.c', text: token })
          await webhooks.send({ url: 'https://x', data: { token } })
        },
      })
    `)
    assert.equal(sinkErrors(diagnostics).length, 3)
  })

  test('flags console, which no type guard covers', async () => {
    const diagnostics = await runInspect(`
      export const leak = pikkuFunc<void, void>({
        func: async ({ secrets }) => {
          const token = await secrets.getSecret('API_KEY')
          console.log(token.reveal())
        },
      })
    `)
    const errors = sinkErrors(diagnostics)
    assert.equal(errors.length, 1)
    assert.match(errors[0]!.message, /console\.log/)
  })

  test('stays quiet when the secret never reaches a sink', async () => {
    const diagnostics = await runInspect(`
      declare function authenticate(token: string): Promise<void>

      export const fine = pikkuFunc<void, void>({
        func: async ({ logger, secrets }) => {
          const token = (await secrets.getSecret('API_KEY')).reveal()
          await authenticate(token)
          logger.info('authenticated')
        },
      })
    `)
    assert.equal(sinkErrors(diagnostics).length, 0)
  })

  test('stays quiet for ordinary logging', async () => {
    const diagnostics = await runInspect(`
      export const fine = pikkuFunc<{ id: string }, void>({
        func: async ({ logger }, data) => {
          logger.info('processing', { id: data.id, at: new Date() })
        },
      })
    `)
    assert.equal(sinkErrors(diagnostics).length, 0)
  })

  test('does not run without the classification flag', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'pikku-secret-sink-off-'))
    const file = join(tmpDir, 'funcs.ts')
    await writeFile(
      file,
      PRELUDE +
        `
      export const leak = pikkuFunc<void, void>({
        func: async ({ logger, secrets }) => {
          const token = await secrets.getSecret('API_KEY')
          logger.info(token.reveal())
        },
      })
    `
    )
    const { logger, diagnostics } = makeLogger()
    try {
      await inspect(logger, [file], { rootDir: tmpDir })
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
    assert.equal(sinkErrors(diagnostics).length, 0)
  })
})
