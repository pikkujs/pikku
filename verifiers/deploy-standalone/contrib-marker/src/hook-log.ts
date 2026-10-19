import { appendFileSync } from 'node:fs'

/** Appends a line to PIKKU_HOOK_LOG; the verifier reads the order back from it. */
export const logHook = (line: string) => {
  const file = process.env.PIKKU_HOOK_LOG
  if (file) appendFileSync(file, `${line}\n`)
}

/** PIKKU_HOOK_FAIL lists `<start|stop>:<contributor>` entries that must throw. */
export const maybeFail = (phase: 'start' | 'stop', name: string) => {
  if (
    (process.env.PIKKU_HOOK_FAIL ?? '').split(',').includes(`${phase}:${name}`)
  ) {
    throw new Error(`${name} ${phase} exploded`)
  }
}
