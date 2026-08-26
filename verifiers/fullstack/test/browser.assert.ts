import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'

import { chromium, type Browser, type Page } from '@playwright/test'

const PASSPHRASE = 'a-passphrase-long-enough-to-be-real-key-material'
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

const gate = async (passphrase: string) => {
  await page.getByTestId('passphrase').fill(passphrase)
  await page.getByTestId('submit').click()
}

before(async () => {
  // A leftover vault would start the store initialized, and the first-run
  // screen this walks through would never be reached.
  await rm(new URL('../.pikku-runtime', import.meta.url), {
    recursive: true,
    force: true,
  })
  origin = await startServer()
  browser = await chromium.launch()
  page = await browser.newPage()
})

after(async () => {
  await browser?.close()
  server?.kill()
})

describe('a browser on the served origin', () => {
  test('renders the page pikku serves from frontend.dir', async () => {
    await page.goto(origin)
    assert.equal(await page.getByTestId('heading').textContent(), 'Notes')
  })

  test('shows the first-run screen, because the store has never been opened', async () => {
    await page.waitForFunction(
      () => document.querySelector('[data-testid="state"]')?.textContent !== '…'
    )
    assert.equal(await stateText(), 'uninitialized')
    assert.equal(
      await page.getByTestId('gate-label').textContent(),
      'Choose a passphrase'
    )
  })

  test('opens the store from the page, and the API answers on the same origin', async () => {
    await gate(PASSPHRASE)
    await page.getByTestId('notes-panel').waitFor({ state: 'visible' })
    assert.equal(await stateText(), 'unlocked')
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

  test('still serves the page once the store is shut', async () => {
    const response = await page.request.post(`${origin}/_pikku/data/lock`, {
      data: { passphrase: PASSPHRASE },
    })
    assert.equal(response.status(), 200)

    await page.goto(origin)
    await page.getByTestId('gate').waitFor({ state: 'visible' })
    assert.equal(await stateText(), 'locked')
    assert.equal(
      await page.getByTestId('gate-label').textContent(),
      'Passphrase'
    )
  })

  test('refuses the notes wiring with 423 while the store is shut', async () => {
    const response = await page.request.get(`${origin}/notes`)
    assert.equal(response.status(), 423)
  })

  test('refuses a wrong passphrase without saying which guess was wrong', async () => {
    await gate('not-the-passphrase')
    await page
      .getByTestId('gate-error')
      .filter({ hasText: 'refused' })
      .waitFor({ state: 'visible' })
    assert.equal(
      await page.getByTestId('gate-error').textContent(),
      'refused (403)'
    )
    assert.equal(await stateText(), 'locked')
  })

  test('reopens on the right passphrase, notes and all', async () => {
    await gate(PASSPHRASE)
    await page.getByTestId('notes-panel').waitFor({ state: 'visible' })
    assert.equal(await stateText(), 'unlocked')
    await page
      .getByText('written from a real browser')
      .waitFor({ state: 'visible' })
  })
})
