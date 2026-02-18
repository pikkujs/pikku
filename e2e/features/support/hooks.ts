import { After, setDefaultTimeout } from '@cucumber/cucumber'
import type { ChildProcess } from 'node:child_process'
import { E2EWorld } from './world.ts'

setDefaultTimeout(120000)

const waitForExit = (child: ChildProcess, timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGKILL')
        resolve()
      }
    }, timeoutMs)

    child.once('exit', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve()
      }
    })
  })

After(async function (this: E2EWorld) {
  const processes = [...this.processes.values()]
  for (const processInfo of processes) {
    if (processInfo.child.exitCode === null) {
      processInfo.child.kill('SIGTERM')
    }
  }
  for (const processInfo of processes) {
    await waitForExit(processInfo.child, 5000)
  }
  this.processes.clear()
})
