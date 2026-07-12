import type { BrowserWorld } from './world.js'
import { disposeSharedBrowser } from './world.js'

export interface BrowserHookApi {
  Before: (fn: (this: BrowserWorld) => void | Promise<void>) => void
  After: (
    fn: (
      this: BrowserWorld,
      arg: { result?: { status?: string } }
    ) => void | Promise<void>
  ) => void
  AfterAll?: (fn: () => void | Promise<void>) => void
  setDefaultTimeout?: (ms: number) => void
}

/**
 * Scenario-level browser lifecycle. Server orchestration (spawning dev
 * servers, golden DBs) stays project-side — these hooks only manage the
 * browser and the optional data-reset call.
 */
export function registerBrowserHooks({ Before, After, AfterAll, setDefaultTimeout }: BrowserHookApi) {
  Before(async function () {
    setDefaultTimeout?.(this.config.timeout)
    if (this.config.resetUrl) {
      const body = this.config.resetRpcName
        ? JSON.stringify({ rpcName: this.config.resetRpcName, data: {} })
        : undefined
      try {
        const res = await fetch(this.config.resetUrl, {
          method: 'POST',
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body,
        })
        if (!res.ok) {
          process.stderr.write(`[e2e] WARN: reset hook ${this.config.resetUrl} returned ${res.status}\n`)
        }
      } catch {
        process.stderr.write(`[e2e] WARN: reset hook ${this.config.resetUrl} unreachable\n`)
      }
    }
  })

  After(async function ({ result }) {
    if (process.env.E2E_DEBUG && result?.status === 'FAILED') {
      for (const actor of this.allActors()) {
        try {
          const url = actor.page.url()
          const text = (await actor.getPageText()).slice(0, 600)
          process.stderr.write(`\n[debug] ${actor.name} — final URL: ${url}\n[debug] body text:\n${text}\n\n`)
        } catch (e) {
          process.stderr.write(`[debug] dump for ${actor.name} failed: ${(e as Error).message}\n`)
        }
      }
    }
    await this.closeAll()
  })

  AfterAll?.(async () => {
    await disposeSharedBrowser()
  })
}
