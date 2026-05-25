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
  cucumber.setDefaultTimeout(timeoutMs)

  cucumber.BeforeAll(function () {
    db.buildBaseDb()
  })

  cucumber.AfterAll(function () {
    db.teardownDb()
  })

  cucumber.Before(async function (this: IFunctionWorld) {
    await this.init(db.freshScenarioDb())
  })

  cucumber.After(async function (this: IFunctionWorld) {
    try {
      this.verify()
    } finally {
      await this.destroy(db.removeScenarioDb.bind(db))
    }
  })
}
