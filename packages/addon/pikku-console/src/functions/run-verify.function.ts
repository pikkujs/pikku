import type { VerifyResult } from '@pikku/code-edit/verify'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const runVerify = pikkuFunc<
  { codegen?: boolean; frontends?: boolean },
  VerifyResult
>({
  title: 'Run Verify',
  description:
    'Type-checks the backend and every frontend and runs the correctness checks, returning each finding with its file, line and a fix. Codegen is off by default because the dev server already keeps it current.',
  expose: true,
  scopes: ['pikku:console:verify:run'],
  func: async ({ verifyService }, input) => {
    if (!verifyService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return verifyService.run({
      codegen: input?.codegen ?? false,
      frontends: input?.frontends ?? true,
    })
  },
})
