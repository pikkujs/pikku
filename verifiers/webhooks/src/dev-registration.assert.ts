import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
// The registrations file is owned by `pikku dev` at a fixed project path, so
// the content service cannot reach it (it only addresses <root>/<visibility>/
// <bucket>/<key>): these direct fs calls stay, and are why webhooks keeps
// lint.enforceContentService off.
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'
import { LocalVariablesService } from '@pikku/core/services'
import { readEndpoints, writeEndpoints } from './fake-provider.js'
import { createScriptContent, getText, putText } from './script-content.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pikkuBin = join(
  root,
  'node_modules',
  '@pikku',
  'cli',
  'dist',
  'bin',
  'pikku.js'
)
const registrationsFile = join(root, '.webhook-registrations.gen.json')
const variables = new LocalVariablesService()
const scratch = join(root, '.pikku-runtime', `webhook-dev-${randomUUID()}`)
const content = createScriptContent(scratch)
const env = {
  ...variables.getAll(),
  WEBHOOK_SCRATCH_DIR: scratch,
  PIKKU_DEV_WEBHOOK_URL: 'https://dev.test',
  PIKKU_DEV_WEBHOOK_LABEL_PREFIX: 'dev-verifier',
}
variables.set('WEBHOOK_SCRATCH_DIR', scratch)

const registrations = () => JSON.parse(readFileSync(registrationsFile, 'utf-8'))
const credentials = async () =>
  JSON.parse(await getText(content, 'credentials', 'credentials.json'))
const writtenAt = () =>
  existsSync(registrationsFile) ? statSync(registrationsFile).mtimeMs : 0

/** Boots `pikku dev` until it has rewritten the registrations file, then stops it. */
const devRun = async () => {
  const before = writtenAt()
  const proc = spawn(process.execPath, [pikkuBin, 'dev', '--port', '4187'], {
    cwd: root,
    env,
    stdio: 'pipe',
  })
  let output = ''
  proc.stdout.on('data', (d) => (output += d))
  proc.stderr.on('data', (d) => (output += d))
  try {
    const start = Date.now()
    while (writtenAt() === before) {
      if (proc.exitCode !== null || Date.now() - start > 90_000) {
        throw new Error(`pikku dev registered nothing:\n${output.slice(-2000)}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
    return output
  } finally {
    proc.kill()
    await new Promise((resolve) =>
      proc.exitCode === null ? proc.once('exit', resolve) : resolve(null)
    )
  }
}

before(async () => {
  rmSync(registrationsFile, { force: true })
  await putText(content, 'credentials', 'credentials.json', '{}')
  await writeEndpoints([])
})

after(async () => {
  rmSync(registrationsFile, { force: true })
  await content.deleteByPrefix('credentials', '')
  await content.deleteByPrefix('provider', '')
  await content.deleteByPrefix('ingest', '')
})

describe('pikku dev: webhook source registration', () => {
  test('the first run registers the source and remembers it privately', async () => {
    await devRun()

    assert.deepEqual(await readEndpoints(), [
      {
        id: 'we_1',
        url: 'https://dev.test/webhooks/shop',
        label: 'dev-verifier:shop',
        events: ['order.paid'],
        secret: 'whsec_dev-verifier:shop',
      },
    ])
    assert.deepEqual(registrations()['dev-verifier'].shop, {
      url: 'https://dev.test/webhooks/shop',
      events: ['order.paid'],
      status: 'created',
      state: { id: 'we_1' },
      credentials: { shopWebhookSecret: 'whsec_dev-verifier:shop' },
    })
    assert.equal(statSync(registrationsFile).mode & 0o777, 0o600)
    assert.equal(
      spawnSync('git', ['check-ignore', '-q', registrationsFile], {
        cwd: root,
      }).status,
      0
    )
  })

  test('the next run calls no provider, restores lost credentials and names what is orphaned', async () => {
    await putText(content, 'credentials', 'credentials.json', '{}')
    const file = registrations()
    file['dev-verifier'].gone = {
      url: 'https://dev.test/webhooks/gone',
      events: [],
      status: 'created',
    }
    writeFileSync(registrationsFile, JSON.stringify(file))

    const output = await devRun()

    assert.equal((await readEndpoints()).length, 1)
    assert.equal(
      (await credentials()).shopWebhookSecret,
      'whsec_dev-verifier:shop'
    )
    assert.match(
      output,
      /'gone' is no longer declared but is still registered at https:\/\/dev\.test\/webhooks\/gone \(label dev-verifier:gone\)/
    )
    assert.ok(registrations()['dev-verifier'].gone)
  })
})
