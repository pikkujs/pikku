import { basename, dirname } from 'node:path'
import { LocalVariablesService } from '@pikku/core/services'
import {
  createScriptContent,
  getText,
  hasKey,
  putText,
} from './script-content.js'

const variables = new LocalVariablesService()
let queue: Promise<unknown> = Promise.resolve()

/**
 * Appends one line to the file the verifier points PIKKU_HOOK_LOG at, so the
 * order of hooks can be read back from a real process. The content service has
 * no append, so this is a read-modify-write chained in this process; the store
 * lives under `<dir of PIKKU_HOOK_LOG>/private/hooks/<basename>`.
 */
export const logHook = (line: string): Promise<void> => {
  const file = variables.get<string>('PIKKU_HOOK_LOG')
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

export const maybeFail = (phase: 'start' | 'stop', name: string) => {
  const failing = (variables.get<string>('PIKKU_HOOK_FAIL') ?? '').split(',')
  if (failing.includes(`${phase}:${name}`)) {
    throw new Error(`${name} ${phase} exploded`)
  }
}
