import {
  addGlobalMiddleware,
  clearPikkuRuntimeState,
  setSingletonServices,
} from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import type { IFunctionWorld } from './world.js'
import type { DbUtils } from './db.js'

type HookFn = (fn: (this: IFunctionWorld) => void | Promise<void>) => void
type GlobalHookFn = (fn: () => void | Promise<void>) => void

export interface CucumberHookApi {
  Before: HookFn
  After: HookFn
  BeforeAll: GlobalHookFn
  AfterAll: GlobalHookFn
  setDefaultTimeout: (ms: number) => void
}

// Highest-priority global middleware that reads x-test-session and injects the
// session before any auth middleware runs. Auto-registered once per process.
const testSessionMiddleware = pikkuMiddleware({
  name: 'test-session-injector',
  priority: 'highest',
  func: async (_services, wire, next) => {
    const header = wire.http?.request?.header('x-test-session')
    if (header) {
      try {
        wire.setSession?.(JSON.parse(header))
      } catch {
        // malformed header — let auth middleware handle it normally
      }
    }
    return next()
  },
})

let testSessionMiddlewareRegistered = false

/**
 * Register lifecycle hooks using the consumer's cucumber instance.
 * Call from hooks.ts after importing Before/After/BeforeAll/AfterAll:
 *
 *   import { Before, After, BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber'
 *   import { registerHooks } from '@pikku/cucumber'
 *   import { db } from './services.js'
 *   registerHooks({ Before, After, BeforeAll, AfterAll, setDefaultTimeout }, db)
 */
export function registerHooks(
  cucumber: CucumberHookApi,
  db: DbUtils,
  timeoutMs = 30_000
): void {
  // Register once synchronously so it's in pikkuState before any scenario runs
  if (!testSessionMiddlewareRegistered) {
    addGlobalMiddleware([testSessionMiddleware])
    testSessionMiddlewareRegistered = true
  }

  cucumber.setDefaultTimeout(timeoutMs)

  cucumber.BeforeAll(function () {
    db.buildBaseDb()
  })

  cucumber.AfterAll(function () {
    db.teardownDb()
  })

  cucumber.Before(async function (this: IFunctionWorld) {
    const dbFile = db.freshScenarioDb()
    await this.init(dbFile)
    clearPikkuRuntimeState()
    setSingletonServices(this.services as never)
  })

  cucumber.After(async function (this: IFunctionWorld) {
    try {
      this.verify()
    } finally {
      await this.destroy(db.removeScenarioDb.bind(db))
    }
  })
}
