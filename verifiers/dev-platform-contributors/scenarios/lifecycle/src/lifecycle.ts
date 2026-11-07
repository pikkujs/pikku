import { basename, dirname } from 'node:path'
import { LocalVariablesService } from '@pikku/core/services'
import { pikkuServerLifecycle } from '#pikku/setup'
import {
  createScriptContent,
  getText,
  hasKey,
  putText,
} from './script-content.js'

let queue: Promise<unknown> = Promise.resolve()

// Same layout as the contributor hooks: the content store under
// `<dir of PIKKU_HOOK_LOG>/private/hooks/<basename>`.
const log = (line: string): Promise<void> => {
  const file = new LocalVariablesService().get<string>('PIKKU_HOOK_LOG')
  if (!file) return Promise.resolve()
  const store = createScriptContent(dirname(file))
  const key = basename(file)
  const next = queue.then(async () => {
    const previous = (await hasKey(store, 'hooks', key))
      ? await getText(store, 'hooks', key)
      : ''
    await putText(store, 'hooks', key, `${previous}${line}\n`)
  })
  queue = next.catch(() => {})
  return next
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
