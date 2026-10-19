import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resolveContributorModule,
  writeDevPlatformServices,
} from './write-dev-platform-services.js'

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

  test('a package contributor exported for import only is loaded from the project', async () => {
    const packageDir = join(root, 'node_modules', '@host', 'mail')
    mkdirSync(join(packageDir, 'src'), { recursive: true })
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@host/mail',
        type: 'module',
        exports: { './contributor': { import: './src/contributor.ts' } },
      })
    )
    writeFileSync(
      join(packageDir, 'src', 'contributor.ts'),
      `export default { name: 'mail', emit: () => ["  services.emailService = { package: true }"] }\n`
    )
    await writeDevPlatformServices(
      logger,
      {
        rootDir: root,
        devPlatformServicesFile,
        dev: { contributors: [{ module: '@host/mail/contributor' }] },
      } as never,
      state
    )
    assert.match(
      readFileSync(devPlatformServicesFile, 'utf8'),
      /services\.emailService = \{ package: true \}/
    )
  })

  test('an addon-declared contributor resolves from the addon package', async () => {
    const addonDir = join(root, 'addons', 'cloud')
    mkdirSync(join(addonDir, 'node_modules', '@addon', 'cloud', 'src'), {
      recursive: true,
    })
    writeFileSync(
      join(addonDir, 'node_modules', '@addon', 'cloud', 'package.json'),
      JSON.stringify({
        name: '@addon/cloud',
        type: 'module',
        exports: { './contributors': { import: './src/contributors.ts' } },
      })
    )
    writeFileSync(
      join(
        addonDir,
        'node_modules',
        '@addon',
        'cloud',
        'src',
        'contributors.ts'
      ),
      `export const session = { name: 'session', provides: ['cloudSession'], emit: () => ["  services.cloudSession = { addon: true }"] }\n`
    )
    writeFileSync(
      join(root, 'reader.ts'),
      `export default { name: 'reader', needs: ['cloudSession'], emit: () => ["  services.reader = services.cloudSession"] }\n`
    )
    await writeDevPlatformServices(
      logger,
      {
        rootDir: root,
        devPlatformServicesFile,
        dev: { contributors: [{ module: './reader.ts' }] },
      } as never,
      {
        ...(state as object),
        addonContributors: {
          cloud: {
            packageName: '@addon/cloud',
            packageDir: addonDir,
            contributors: [
              { module: '@addon/cloud/contributors', export: 'session' },
            ],
          },
        },
      } as never
    )
    const code = readFileSync(devPlatformServicesFile, 'utf8')
    assert.ok(
      code.indexOf('services.cloudSession = { addon: true }') <
        code.indexOf('services.reader = services.cloudSession')
    )
  })

  test('addon contributors alone are enough to write the file', async () => {
    writeFileSync(
      join(root, 'only.ts'),
      `export const only = { name: 'only', emit: () => ["  services.only = true"] }\n`
    )
    await writeDevPlatformServices(
      logger,
      { rootDir: root, devPlatformServicesFile } as never,
      {
        ...(state as object),
        addonContributors: {
          x: {
            packageName: '@x/x',
            packageDir: root,
            contributors: [{ module: './only.ts', export: 'only' }],
          },
        },
      } as never
    )
    assert.match(
      readFileSync(devPlatformServicesFile, 'utf8'),
      /services\.only = true/
    )
  })

  test('a contributor cycle fails codegen', async () => {
    writeFileSync(
      join(root, 'loop.ts'),
      `export default { name: 'loop', needs: ['x'], provides: ['x'], emit: () => [] }\n`
    )
    await assert.rejects(
      writeDevPlatformServices(
        logger,
        {
          rootDir: root,
          devPlatformServicesFile,
          dev: { contributors: [{ module: './loop.ts' }] },
        } as never,
        state
      ),
      /cycle: loop -> loop/
    )
  })

  test('a contributor the project cannot resolve is refused by name', () => {
    assert.throws(
      () => resolveContributorModule(root, '@host/missing/contributor'),
      /dev\.contributors: cannot resolve '@host\/missing\/contributor'/
    )
  })
})
