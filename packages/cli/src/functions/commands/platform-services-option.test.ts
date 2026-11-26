import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadPlatformServicesOption } from './platform-services-option.js'

describe('loadPlatformServicesOption', () => {
  let root: string

  beforeEach(() => {
    const base = join(import.meta.dir, '..', '..', '..', '.tmp')
    mkdirSync(base, { recursive: true })
    root = mkdtempSync(join(base, 'platform-option-'))
    writeFileSync(join(root, 'package.json'), '{"name":"app","type":"module"}')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const hostModule = (name: string) =>
    `export const createPlatformServices = (env, services, context) => ({
  mailer: '${name} for ' + env.WHO + ' over ' + services.mailer,
  seen: context.requiredServices,
})\n`
  const load = (
    specifier: string | undefined,
    services: Record<string, unknown> = { mailer: 'local', kept: 1 }
  ) =>
    loadPlatformServicesOption(specifier, services, {
      rootDir: root,
      env: { WHO: 'dev' },
      requiredServices: ['mailer'],
    })

  test('without the option the services come back untouched', async () => {
    const services = { mailer: 'local' }
    assert.equal(await load(undefined, services), services)
  })

  test('a path is read from the project root, and what the module returns replaces the local services', async () => {
    write('host/platform.mjs', hostModule('path'))
    assert.deepEqual(await load('./host/platform.mjs'), {
      mailer: 'path for dev over local',
      kept: 1,
      seen: ['mailer'],
    })
  })

  test('an absolute path works', async () => {
    write('elsewhere/platform.mjs', hostModule('absolute'))
    const services = await load(join(root, 'elsewhere/platform.mjs'))
    assert.equal(services.mailer, 'absolute for dev over local')
  })

  test('a package subpath that only exports to import resolves from the project', async () => {
    write(
      'node_modules/@host/tools/package.json',
      '{"name":"@host/tools","type":"module","exports":{"./platform":{"import":"./platform.js"}}}'
    )
    write('node_modules/@host/tools/platform.js', hostModule('package'))
    const services = await load('@host/tools/platform')
    assert.equal(services.mailer, 'package for dev over local')
  })

  test('a package that cannot be found is named', async () => {
    await assert.rejects(
      load('@host/missing'),
      /--platform-services '@host\/missing' was not found/
    )
  })

  test('a module without createPlatformServices is refused', async () => {
    write('empty.mjs', 'export const other = 1\n')
    await assert.rejects(
      load('./empty.mjs'),
      /does not export createPlatformServices/
    )
  })
})
