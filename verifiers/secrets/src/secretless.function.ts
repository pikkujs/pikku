import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const SecretlessOutput = z.object({ ok: z.boolean() })

/**
 * `secrets` is omitted from a function's services, so destructuring it must not
 * compile. If this stops erroring the boundary has regressed.
 */
export const reachesForSecrets = pikkuSessionlessFunc({
  disabled: 'no callers found, 2026-10-20',
  output: SecretlessOutput,
  // @ts-expect-error - 'secrets' is not available inside a pikku function
  func: async ({ secrets }) => {
    void secrets
    return { ok: true }
  },
})

export const usesOnlyAllowedServices = pikkuSessionlessFunc({
  disabled: 'no callers found, 2026-10-20',
  output: SecretlessOutput,
  func: async ({ logger }) => {
    logger.info('secretless')
    return { ok: true }
  },
})
