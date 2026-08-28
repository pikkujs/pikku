import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'

import { chromium, type Browser, type Page } from '@playwright/test'

const READY_MARKER = 'pikku: ready on '
const START_TIMEOUT_MS = 90_000

const projectDir = fileURLToPath(new URL('..', import.meta.url))

let server: ChildProcess
let browser: Browser
let page: Page
let origin: string

/**
 * Start `pikku serve` and read the origin out of its ready line.
 *
 * `--port 0` rather than a fixed port: verifiers run in parallel and a
 * neighbour holding the port would look exactly like a regression here.
 */
const startServer = () =>
  new Promise<string>((resolve, reject) => {
    server = spawn('npx', ['pikku', 'serve', '--port', '0'], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })

    const timer = setTimeout(
      () => reject(new Error(`server never printed "${READY_MARKER}"`)),
      START_TIMEOUT_MS
    )

    let output = ''
    const read = (chunk: Buffer) => {
      output += chunk.toString()
      const marker = output.indexOf(READY_MARKER)
      if (marker === -1) return
      const line = output.slice(marker + READY_MARKER.length)
      const end = line.search(/\s/)
      if (end === -1) return
      clearTimeout(timer)
      resolve(line.slice(0, end))
    }

    server.stdout!.on('data', read)
    server.stderr!.on('data', read)
    server.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`server exited with ${code}\n${output}`))
    })
  })

const stateText = () => page.getByTestId('state').textContent()

before(async () => {
  origin = await startServer()
  browser = await chromium.launch()
  page = await browser.newPage()
})

/**
 * Stop the server and everything it started.
 *
 * `npx` forks rather than execs, so signalling the child reaches the wrapper
 * and leaves the real server holding the pipes that keep this process alive —
 * the suite passes and node then never exits. The spawn puts the server in its
 * own process group and this signals the group, with SIGKILL behind a grace
 * period so a server that ignores SIGTERM cannot hang the run either.
 */
const stopServer = async () => {
  const pid = server?.pid
  if (!pid || server.exitCode !== null || server.signalCode !== null) return

  const exited = once(server, 'exit')
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-pid, name)
    } catch {
      server.kill(name)
    }
  }

  signal('SIGTERM')
  const hard = setTimeout(() => signal('SIGKILL'), 5_000)
  try {
    await exited
  } finally {
    clearTimeout(hard)
  }
}

after(async () => {
  await browser?.close()
  await stopServer()
})

describe('a browser on the served origin', () => {
  test('renders the page pikku serves from frontend.dir', async () => {
    await page.goto(origin)
    assert.equal(await page.getByTestId('heading').textContent(), 'Notes')
  })

  test('the page fetches the API on the origin it was served from', async () => {
    await page.waitForFunction(
      () => document.querySelector('[data-testid="state"]')?.textContent !== '…'
    )
    assert.equal(await stateText(), 'ready')
    assert.equal(
      await page.getByTestId('note-seeded').textContent(),
      'a note that was already here'
    )
  })

  test('a write the page makes comes back on the next read', async () => {
    await page.getByTestId('new-note').fill('written from a real browser')
    await page.getByTestId('add').click()
    await page
      .getByText('written from a real browser')
      .waitFor({ state: 'visible' })
  })

  test('serves index.html for a path no wiring owns', async () => {
    await page.goto(`${origin}/some/deep/client-route`)
    assert.equal(await page.getByTestId('heading').textContent(), 'Notes')
  })

  test('a reload reads the write back from the server', async () => {
    await page.goto(origin)
    await page
      .getByText('written from a real browser')
      .waitFor({ state: 'visible' })
  })
})
