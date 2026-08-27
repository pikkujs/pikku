import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { PARENT_PID_ENV } from './parent-watch.js'

const parentWatchUrl = pathToFileURL(
  fileURLToPath(new URL('./parent-watch.ts', import.meta.url))
).href

/**
 * A stand-in for the compiled pikku binary: it installs the watch with its real
 * defaults — including `process.exit` — and then holds the event loop open the
 * way a listening server would.
 */
const SIDECAR = `
import { watchParentProcess } from ${JSON.stringify(parentWatchUrl)}
watchParentProcess({ intervalMs: 25 })
setInterval(() => {}, 1000)
console.log('sidecar-up')
`

const spawnNode = (args: string[], env?: NodeJS.ProcessEnv) =>
  spawn(process.execPath, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const waitForExit = (child: ReturnType<typeof spawn>, timeoutMs: number) =>
  new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('the sidecar was still running')),
      timeoutMs
    )
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })

const waitForStdout = (child: ReturnType<typeof spawn>, needle: string) =>
  new Promise<void>((resolve, reject) => {
    let seen = ''
    const timer = setTimeout(
      () => reject(new Error(`never printed ${needle}: ${seen}`)),
      20_000
    )
    child.stdout?.on('data', (chunk) => {
      seen += String(chunk)
      if (seen.includes(needle)) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.stderr?.on('data', (chunk) => (seen += String(chunk)))
  })

describe('a sidecar whose shell dies without cleaning up', () => {
  it('exits on its own once the watched process is gone', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-parent-watch-'))
    const script = join(dir, 'sidecar.mjs')
    await writeFile(script, SIDECAR, 'utf-8')

    // Stands in for the desktop shell. Killed with SIGKILL, so nothing it
    // might have done on the way out can be what stops the sidecar.
    const shell = spawnNode(['-e', 'setInterval(() => {}, 1000)'])
    const sidecar = spawnNode(['--import', 'tsx', script], {
      [PARENT_PID_ENV]: String(shell.pid),
    })

    try {
      await waitForStdout(sidecar, 'sidecar-up')
      assert.equal(sidecar.exitCode, null, 'the sidecar must start out running')

      shell.kill('SIGKILL')

      const code = await waitForExit(sidecar, 20_000)
      assert.equal(code, 0, 'an orphaned sidecar must exit cleanly')
    } finally {
      shell.kill('SIGKILL')
      sidecar.kill('SIGKILL')
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps running when no shell pid was handed down', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-parent-watch-'))
    const script = join(dir, 'sidecar.mjs')
    await writeFile(script, SIDECAR, 'utf-8')

    const sidecar = spawnNode(['--import', 'tsx', script], {
      [PARENT_PID_ENV]: undefined,
    })

    try {
      await waitForStdout(sidecar, 'sidecar-up')
      await new Promise((resolve) => setTimeout(resolve, 300))
      assert.equal(
        sidecar.exitCode,
        null,
        'a server run from a terminal must not exit'
      )
    } finally {
      sidecar.kill('SIGKILL')
      await rm(dir, { recursive: true, force: true })
    }
  })
})
