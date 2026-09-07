import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeRemoteJobs } from './serialize-remote-jobs.js'

const leaf = (name: string) => `./${name}/index.js`

describe('serializeRemoteJobs', () => {
  test('wires both inbox routes on the paths a dispatcher already posts to', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(functions.includes("route: '/__pikku/queue-job'"))
    assert.ok(functions.includes("route: '/__pikku/scheduler-job'"))
    assert.ok(functions.includes('runQueueJob'))
    assert.ok(functions.includes('runScheduledTask'))
  })

  test('guards both routes with the dispatch secret', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.equal(
      functions.split('middleware: [remoteJobsSecretMiddleware]').length - 1,
      2,
      'both routes carry the guard'
    )
    assert.ok(functions.includes("variables?.get?.('PIKKU_DISPATCH_SECRET')"))
    assert.ok(functions.includes("http?.request?.header?.('x-pikku-dispatch')"))
  })

  test('rejects when no secret is configured', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(
      functions.includes(
        "if (!expected || typeof provided !== 'string' || !safeEqual(provided, expected))"
      ),
      'an unset secret must reject rather than open the inbox'
    )
  })

  test('separates a permanent failure from one worth redelivering', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(functions.includes('PikkuMissingMetaError'))
    assert.ok(functions.includes('QueueJobDiscardedError'))
    assert.ok(functions.includes('ScheduledTaskNotFoundError'))
    assert.equal(
      functions.split('throw new BadRequestError').length - 1,
      2,
      'each route acks its own permanent failure'
    )
  })

  test('imports each wiring helper from its own leaf', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(
      functions.includes(
        "import { pikkuSessionlessFunc, type SingletonServices } from './function/index.js'"
      )
    )
    assert.ok(functions.includes("import { wireHTTP } from './http/index.js'"))
    assert.ok(
      functions.includes(
        "import { pikkuMiddleware } from './middleware/index.js'"
      )
    )
  })

  test('describes both payloads with zod schemas from the sibling module', () => {
    const { schemas, functions } = serializeRemoteJobs(leaf)
    assert.ok(schemas.includes("import { z } from 'zod'"))
    assert.ok(schemas.includes('export const RemoteQueueJob = z.object({'))
    assert.ok(schemas.includes('export const RemoteScheduledJob = z.object({'))
    assert.ok(functions.includes('input: RemoteQueueJob'))
    assert.ok(functions.includes('input: RemoteScheduledJob'))
    assert.ok(functions.includes("from './remote-jobs.schemas.gen.js'"))
    assert.ok(!functions.includes('pikkuSessionlessFunc<'))
  })

  test('keeps the schemas module free of anything but zod', () => {
    const { schemas } = serializeRemoteJobs(leaf)
    assert.ok(!schemas.includes('pikku-types.gen.js'))
    assert.ok(!schemas.includes('@pikku/core'))
  })
})
