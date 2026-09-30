import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type StepStart = { attempt: number; pid: number }

/**
 * Record that a step attempt started, and return which attempt it is.
 *
 * The exclusive create is what numbers attempts: two starts can never claim the
 * same file, so the count survives the worker that wrote it being killed.
 */
export const recordStepStart = (
  dir: string,
  runId: string,
  pid: number
): number => {
  const runDir = join(dir, runId)
  mkdirSync(runDir, { recursive: true })
  for (let attempt = readdirSync(runDir).length + 1; ; attempt++) {
    try {
      writeFileSync(join(runDir, String(attempt)), String(pid), { flag: 'wx' })
      return attempt
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error
    }
  }
}

export const readStepStarts = (dir: string, runId: string): StepStart[] => {
  const runDir = join(dir, runId)
  let names: string[]
  try {
    names = readdirSync(runDir)
  } catch {
    return []
  }
  return names
    .map((name) => ({
      attempt: Number(name),
      pid: Number(readFileSync(join(runDir, name), 'utf8')),
    }))
    .sort((a, b) => a.attempt - b.attempt)
}
