import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const recordingLogger = () => {
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  const logger: InspectorLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    critical: (code, message) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }
  return { logger, criticals }
}

const withTempApp = async (
  source: string,
  run: (file: string, rootDir: string) => Promise<void>
) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-addon-bans-'))
  const file = join(rootDir, 'app.ts')
  await writeFile(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: 'test-addon', type: 'module' }, null, 2)
  )
  await writeFile(file, source)
  try {
    await run(file, rootDir)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('addon authoring bans', () => {
  const wireHTTPSource = [
    "import { wireHTTP } from '@pikku/core/http'",
    "import { pikkuSessionlessFunc } from '@pikku/core'",
    'const f = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })',
    "wireHTTP({ method: 'get', route: '/a', func: f })",
  ].join('\n')

  const defineWithMiddlewareSource = [
    "import { defineHTTPRoutes } from '@pikku/core/http'",
    "import { pikkuSessionlessFunc } from '@pikku/core'",
    'const f = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })',
    'const mw = (async (_s: any, _w: any, next: any) => next()) as any',
    "export const routes = defineHTTPRoutes({ basePath: '/x', routes: { a: { method: 'get', route: '/a', func: f, middleware: [mw] } } })",
  ].join('\n')

  test('wire* inside an addon is a critical error', async () => {
    await withTempApp(wireHTTPSource, async (file, rootDir) => {
      const { logger, criticals } = recordingLogger()
      await inspect(logger, [file], { rootDir, isAddon: true })
      assert.ok(
        criticals.some((c) => c.code === ErrorCode.ADDON_WIRING_NOT_ALLOWED),
        `expected ADDON_WIRING_NOT_ALLOWED, got ${JSON.stringify(criticals)}`
      )
    })
  })

  test('wire* outside an addon is allowed', async () => {
    await withTempApp(wireHTTPSource, async (file, rootDir) => {
      const { logger, criticals } = recordingLogger()
      await inspect(logger, [file], { rootDir })
      assert.ok(
        !criticals.some((c) => c.code === ErrorCode.ADDON_WIRING_NOT_ALLOWED),
        `expected no addon-wiring ban, got ${JSON.stringify(criticals)}`
      )
    })
  })

  test('define* carrying middleware inside an addon is a critical error', async () => {
    await withTempApp(defineWithMiddlewareSource, async (file, rootDir) => {
      const { logger, criticals } = recordingLogger()
      await inspect(logger, [file], { rootDir, isAddon: true })
      assert.ok(
        criticals.some(
          (c) => c.code === ErrorCode.ADDON_CONTRACT_HANDLERS_NOT_ALLOWED
        ),
        `expected ADDON_CONTRACT_HANDLERS_NOT_ALLOWED, got ${JSON.stringify(criticals)}`
      )
    })
  })

  test('define* carrying middleware outside an addon is allowed', async () => {
    await withTempApp(defineWithMiddlewareSource, async (file, rootDir) => {
      const { logger, criticals } = recordingLogger()
      await inspect(logger, [file], { rootDir })
      assert.ok(
        !criticals.some(
          (c) => c.code === ErrorCode.ADDON_CONTRACT_HANDLERS_NOT_ALLOWED
        ),
        `expected no contract-handlers ban, got ${JSON.stringify(criticals)}`
      )
    })
  })

  test('wireSecret inside an addon is allowed', async () => {
    const source = [
      "import { wireSecret } from '@pikku/core'",
      "wireSecret({ name: 'example', secretId: 'EXAMPLE' } as any)",
    ].join('\n')
    await withTempApp(source, async (file, rootDir) => {
      const { logger, criticals } = recordingLogger()
      await inspect(logger, [file], { rootDir, isAddon: true })
      assert.ok(
        !criticals.some((c) => c.code === ErrorCode.ADDON_WIRING_NOT_ALLOWED),
        `expected wireSecret to be allowed, got ${JSON.stringify(criticals)}`
      )
    })
  })
})
