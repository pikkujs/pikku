import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeRemoteJobs } from './serialize-remote-jobs.js'

const leaf = (name: string) => `./${name}/index.js`

describe('serializeRemoteJobs', () => {
  test('wires both inbox routes on the paths a dispatcher already posts to', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(functions.includes("route: '/__pikku/queue-job'"))
    assert.ok(functions.includes("route: '/__pikku/scheduler-job'"))
    assert.ok(functions.includes("tags: ['pikku']"))
  })

  test('spells the routes out so the inspector can read them', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(
      !functions.includes('REMOTE_QUEUE_JOB_PATH'),
      'a constant would leave the HTTP map without a route'
    )
  })

  test('delegates the work to core rather than generating it', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(functions.includes('pikkuRemoteQueueJobFunc'))
    assert.ok(functions.includes('pikkuRemoteScheduledJobFunc'))
    assert.ok(functions.includes("from '@pikku/core/services'"))
    assert.ok(
      !functions.includes('runQueueJob') && !functions.includes('runScheduledTask'),
      'the runners belong to core, not to generated source'
    )
  })

  test('guards both routes with the middleware core exports', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(
      functions.includes("import { remoteJobsSecret } from '@pikku/core/middleware'")
    )
    assert.equal(
      functions.split('middleware: [remoteJobsSecret]').length - 1,
      2,
      'both routes carry the guard'
    )
  })

  test('imports each wiring helper from its own leaf', () => {
    const { functions } = serializeRemoteJobs(leaf)
    assert.ok(
      functions.includes("import { pikkuSessionlessFunc } from './function/index.js'")
    )
    assert.ok(functions.includes("import { wireHTTP } from './http/index.js'"))
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
