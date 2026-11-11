import { createHash } from 'node:crypto'
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Logger } from '@pikku/core/services'

const POLL_MS = 200
const WAIT_MS = 5 * 60_000

/**
 * A killed process whose parent is gone and never reaps it (a container whose
 * init does not wait on orphans) stays a zombie, and `kill(pid, 0)` still
 * succeeds on it. It runs nothing, so it holds nothing.
 */
const isZombie = (pid: number): boolean => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z')
  } catch {
    return false
  }
}

export const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
  return !isZombie(pid)
}

const lockFileFor = (outDir: string): string =>
  join(
    tmpdir(),
    `pikku-all-${createHash('sha256').update(outDir).digest('hex').slice(0, 16)}.lock`
  )

const readHolder = (file: string): number | undefined => {
  try {
    if (Date.now() - statSync(file).mtimeMs > WAIT_MS) return undefined
    const pid = Number(readFileSync(file, 'utf8'))
    return pid && !isRunning(pid) ? undefined : pid
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
}

/**
 * Runs `work` as the only `pikku all` on this output directory. Two at once write
 * over each other and leave a tree neither of them produced, so the later one
 * waits. A holder that died, however it died, gives the lock up by no longer
 * being a running pid.
 */
export const withCodegenLock = async <T>(
  logger: Logger,
  outDir: string,
  work: () => Promise<T>
): Promise<T> => {
  const file = lockFileFor(outDir)
  const deadline = Date.now() + WAIT_MS
  let waiting = false
  for (;;) {
    try {
      writeFileSync(file, String(process.pid), { flag: 'wx' })
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const holder = readHolder(file)
    if (holder === process.pid) return work()
    if (holder === undefined) {
      rmSync(file, { force: true })
      continue
    }
    if (Date.now() > deadline) {
      throw new Error(`Another pikku all (pid ${holder}) is still running`)
    }
    if (!waiting && holder) {
      waiting = true
      logger.info(`Waiting for pikku all (pid ${holder}) to finish`)
    }
    await sleep(POLL_MS)
  }
  try {
    return await work()
  } finally {
    rmSync(file, { force: true })
  }
}
