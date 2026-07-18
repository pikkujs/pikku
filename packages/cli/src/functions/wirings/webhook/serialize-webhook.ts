/**
 * Generate the outgoing webhook delivery queue worker.
 *
 * The payload type is an inline TS literal (not zod): the inspector imports a
 * zod schema's declaring module at codegen time, and the wiring file's
 * pikku-types import can go stale between deploy per-unit codegen runs, which
 * would fail schema generation before the wiring gets rewritten. TS-based
 * schema generation goes through the type checker instead, so it never
 * imports this file.
 *
 * The handler is inlined: it is wired exactly once, so a named export would
 * only be indirection.
 */
export const serializeWebhook = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated outgoing webhook delivery queue worker
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '${pathToPikkuTypes}'
import { pikkuWebhookWorkerFunc } from '@pikku/core/services'

wireQueueWorker({
  name: 'pikku-outgoing-webhooks',
  tags: ['pikku'],
  func: pikkuSessionlessFunc<
    { url: string, event?: string, body: string, headers: Record<string, string>, deliveryId?: string },
    void
  >({
    tags: ['pikku'],
    func: async (services, data) => pikkuWebhookWorkerFunc(services, data),
  }),
})
`
}
