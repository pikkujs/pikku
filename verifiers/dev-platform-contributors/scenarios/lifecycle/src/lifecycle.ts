import { appendFileSync } from 'node:fs'
import { pikkuServerLifecycle } from '#pikku/setup'

const log = (line: string) => {
  const file = process.env.PIKKU_HOOK_LOG
  if (file) appendFileSync(file, `${line}\n`)
}

// `hookC` is what the contributor chain built; it only reaches the services
// when the platform services were loaded before createSingletonServices.
export const lifecycle = pikkuServerLifecycle({
  beforeStart: (services) =>
    log(`app:beforeStart hookC=${(services as any).hookC ?? 'missing'}`),
  afterStart: () => log('app:afterStart'),
  beforeStop: () => log('app:beforeStop'),
  afterStop: () => log('app:afterStop'),
})
