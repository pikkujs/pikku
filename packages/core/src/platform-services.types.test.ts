import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuPlatformServices } from './lifecycle.js'

type Services = { greeting: string }

test('a platform services function is typed by the services and env it names', async () => {
  const create = pikkuPlatformServices<Services, { NAME: string }>(
    (env, _services, { requiredServices }) => ({
      greeting: `${env.NAME} ${requiredServices.join()}`,
    })
  )
  assert.deepEqual(
    await create({ NAME: 'host' }, {}, { requiredServices: ['greeting'] }),
    { greeting: 'host greeting' }
  )

  pikkuPlatformServices<Services>(
    // @ts-expect-error a service has the type the host declares for it
    () => ({ greeting: 1 })
  )
  pikkuPlatformServices<Services, { NAME: string }>((env) => {
    // @ts-expect-error env has only what the host declares
    env.OTHER
    return {}
  })
})
