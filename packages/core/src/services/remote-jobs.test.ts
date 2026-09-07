import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { BadRequestError, UnauthorizedError } from '../errors/errors.js'
import { resetPikkuState, setSingletonServices } from '../pikku-state.js'
import { remoteJobsSecret } from '../middleware/remote-jobs-secret.js'
import {
  REMOTE_JOBS_SECRET_HEADER,
  pikkuRemoteScheduledJobFunc,
} from './remote-jobs.js'

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any

const wire = (header?: string) =>
  ({
    http: { request: { header: () => header ?? null } },
  }) as any

const services = (secret?: string) =>
  ({ variables: { get: async () => secret } }) as any

describe('remoteJobsSecret', () => {
  test('lets a caller holding the secret through', async () => {
    let reached = false
    await remoteJobsSecret(services('s3cret'), wire('s3cret'), async () => {
      reached = true
    })
    assert.equal(reached, true)
  })

  test('rejects a caller presenting the wrong secret', async () => {
    await assert.rejects(
      remoteJobsSecret(services('s3cret'), wire('nope'), async () => {}),
      UnauthorizedError
    )
  })

  test('rejects when the deployment configured no secret at all', async () => {
    await assert.rejects(
      remoteJobsSecret(services(undefined), wire('anything'), async () => {}),
      UnauthorizedError
    )
  })

  test('rejects a caller presenting no header', async () => {
    await assert.rejects(
      remoteJobsSecret(services('s3cret'), wire(), async () => {}),
      UnauthorizedError
    )
  })

  test('reads the header the dispatchers already send', async () => {
    const seen: string[] = []
    await assert.rejects(
      remoteJobsSecret(
        services('s3cret'),
        {
          http: {
            request: {
              header: (name: string) => {
                seen.push(name)
                return null
              },
            },
          },
        } as any,
        async () => {}
      ),
      UnauthorizedError
    )
    assert.deepEqual(seen, [REMOTE_JOBS_SECRET_HEADER])
  })

  test('awaits a variables service that resolves asynchronously', async () => {
    let reached = false
    await remoteJobsSecret(
      {
        variables: {
          get: () => new Promise((resolve) => setTimeout(() => resolve('s3cret'), 1)),
        },
      } as any,
      wire('s3cret'),
      async () => {
        reached = true
      }
    )
    assert.equal(reached, true)
  })
})

describe('pikkuRemoteScheduledJobFunc', () => {
  test('acks a task this deployment does not have rather than asking for a retry', async () => {
    resetPikkuState()
    setSingletonServices({ logger: silentLogger } as any)
    await assert.rejects(
      pikkuRemoteScheduledJobFunc({ logger: silentLogger }, {
        taskName: 'not-a-task',
      }),
      BadRequestError
    )
  })
})
