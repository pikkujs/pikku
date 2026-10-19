import { appendFileSync } from 'node:fs'

/**
 * Appends one line to the file the verifier points PIKKU_HOOK_LOG at, so the
 * order of contributor and app hooks can be read back from a real process.
 * PIKKU_HOOK_FAIL names one `<start|stop>:<contributor>` to throw from.
 */
export const logHook = (line: string) => {
  const file = process.env.PIKKU_HOOK_LOG
  if (file) appendFileSync(file, `${line}\n`)
}

export const maybeFail = (phase: 'start' | 'stop', name: string) => {
  const failing = (process.env.PIKKU_HOOK_FAIL ?? '').split(',')
  if (failing.includes(`${phase}:${name}`)) {
    throw new Error(`${name} ${phase} exploded`)
  }
}
