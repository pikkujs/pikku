import { pikkuSessionlessFunc } from '#pikku/function'
import { pikkuState } from '@pikku/core/state'
import type { TelemetryStore } from '@pikku/core/telemetry-store'

const scope = { project: 'verifier', stage: 'production' }

/** Writes a log line through the provided store and reads it back. */
export const roundtrip = pikkuSessionlessFunc<
  { body: string },
  { provided: boolean; bodies: string[]; failures: number }
>({
  auth: false,
  func: async ({ telemetryStore }: Record<string, unknown>, { body }) => {
    const store = telemetryStore as TelemetryStore | undefined
    if (!store?.appendLogs) {
      return { provided: false, bodies: [], failures: 0 }
    }
    await store.appendLogs(scope, [
      { at: Date.now(), severity: 'info', body, source: 'app' },
    ])
    const rows = await store.logs(scope, { search: body })
    const failures = await store.failures(scope, { since: Date.now() - 60_000 })
    return {
      provided: true,
      bodies: rows.map((row) => row.body),
      failures: failures.length,
    }
  },
})

/** The addons the runtime has registered: what Studio lists as installed. */
export const installed = pikkuSessionlessFunc<
  void,
  { addons: Array<{ name: string; package: string | null }> }
>({
  auth: false,
  func: async () => ({
    addons: [...pikkuState(null, 'addons', 'packages')].map(
      ([name, config]) => ({
        name,
        package: (config as { package?: string }).package ?? null,
      })
    ),
  }),
})
