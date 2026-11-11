import { isRunning } from './codegen-lock.js'

/**
 * Calls `onGone` once the parent process is no longer running. A child cannot
 * be told when its parent is SIGKILLed, so it asks: the pid is re-parented
 * (ppid changes) or stops existing.
 */
export const exitWhenParentDies = (
  parentPid: number,
  onGone: () => void,
  intervalMs = 1000
): (() => void) => {
  if (!parentPid || parentPid === 1) return () => {}
  const timer = setInterval(() => {
    if (process.ppid !== parentPid || !isRunning(parentPid)) {
      clearInterval(timer)
      onGone()
    }
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
