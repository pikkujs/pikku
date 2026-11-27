import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  PLATFORM_SERVICES_FILE,
  writeUnitPlatformServices,
} from './platform-services.js'

describe('writeUnitPlatformServices', () => {
  let unitDir: string

  beforeEach(() => {
    const base = join(import.meta.dir, '..', '..', '.tmp')
    mkdirSync(base, { recursive: true })
    unitDir = mkdtempSync(join(base, 'unit-platform-'))
  })
  afterEach(() => rmSync(unitDir, { recursive: true, force: true }))

  const run = (
    module: string | undefined,
    extra: {
      requiredServices?: Set<string>
      projectServicesRead?: string[]
      coercionMap?: Record<string, Record<string, string>>
    } = {}
  ) =>
    writeUnitPlatformServices({
      provider: {
        name: 'fake',
        ...(module ? { platformServicesModule: () => module } : {}),
      } as never,
      ctx: {
        unit: { name: 'api' },
        unitDir,
        coercionMap: extra.coercionMap,
      } as never,
      requiredServices: extra.requiredServices ?? new Set(),
      projectServicesRead: extra.projectServicesRead,
    })

  const file = () => readFileSync(join(unitDir, PLATFORM_SERVICES_FILE), 'utf8')

  test("calls the provider's platform services module with what the unit requires", async () => {
    const result = await run('@acme/host', {
      requiredServices: new Set(['queueService']),
    })
    assert.equal(result?.importPath, './platform-services.gen.js')
    assert.match(
      file(),
      /import \{ createPlatformServices as createHostPlatformServices \} from "@acme\/host"/
    )
    assert.match(file(), /requiredServices: \["queueService"\]/)
    assert.doesNotMatch(file(), /createCoercionPlugin/)
  })

  test('what the project factory reads counts as required', async () => {
    await run('@acme/host', { projectServicesRead: ['kysely'] })
    assert.match(file(), /requiredServices: \["kysely"\]/)
  })

  test('wraps a kysely the host creates when the app has columns to convert', async () => {
    await run('@acme/host', {
      coercionMap: { users: { created_at: 'date' } },
    })
    assert.match(
      file(),
      /if \(hosted\.kysely && hosted\.kysely !== runtime\.kysely\) hosted\.kysely = coercedKysely\(hosted\.kysely\)/
    )
  })

  test('a provider with no module writes nothing and removes a stale file', async () => {
    writeFileSync(join(unitDir, PLATFORM_SERVICES_FILE), 'stale')
    assert.equal(await run(undefined), undefined)
    assert.equal(existsSync(join(unitDir, PLATFORM_SERVICES_FILE)), false)
  })
})
