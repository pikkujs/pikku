import type { VerifyResult } from '@pikku/code-edit/verify'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const getVerifyResults = pikkuFunc<
  null,
  { running: boolean; result: VerifyResult | null }
>({
  title: 'Get Verify Results',
  description:
    'The latest verify run, from the console or `pikku verify`, and whether one is in progress.',
  expose: true,
  scopes: ['pikku:console:verify:read'],
  func: async ({ verifyService }) => {
    if (!verifyService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return {
      running: verifyService.isRunning,
      result: await verifyService.last(),
    }
  },
})
