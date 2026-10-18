import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeDevPlatformServices } from './write-dev-platform-services.js'

const logger = new Proxy({}, { get: () => () => {} }) as never
const state = {
  serviceAggregation: { requiredServices: new Set(['emailService']) },
} as never

describe('writeDevPlatformServices', () => {
  let root: string
  let devPlatformServicesFile: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-write-dev-platform-'))
    devPlatformServicesFile = join(root, 'dev.gen.ts')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('no contributors configured writes nothing', async () => {
    await writeDevPlatformServices(
      logger,
      { rootDir: root, devPlatformServicesFile } as never,
      state
    )
    assert.equal(existsSync(devPlatformServicesFile), false)
  })

  test('removing the contributors removes the stale file', async () => {
    writeFileSync(devPlatformServicesFile, 'stale')
    await writeDevPlatformServices(
      logger,
      {
        rootDir: root,
        devPlatformServicesFile,
        dev: { contributors: [] },
      } as never,
      state
    )
    assert.equal(existsSync(devPlatformServicesFile), false)
  })

  test('a configured contributor is loaded from its module and emitted', async () => {
    writeFileSync(
      join(root, 'email.ts'),
      `export const email = { name: 'email', emit: () => ["  services.emailService = { host: true }"] }\n`
    )
    await writeDevPlatformServices(
      logger,
      {
        rootDir: root,
        devPlatformServicesFile,
        dev: { contributors: [{ module: './email.ts', export: 'email' }] },
      } as never,
      state
    )
    assert.match(
      readFileSync(devPlatformServicesFile, 'utf8'),
      /services\.emailService = \{ host: true \}/
    )
  })
})
