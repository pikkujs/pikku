/**
 * Variables the deployer injects that no scaffold declares for it.
 *
 * `VIRTUAL_USER_VERIFY_KEY` is the public half of the stage's virtual user key pair,
 * read by `auth.ts`. It is optional because only a stage that runs virtual users has one.
 *
 * `deploy.steps.ts` seeds one `<FRONTEND>_URL` per entry in
 * `pikku.config.json`'s `frontends` at the stage's own scope, so this
 * project's single `app` frontend gets `APP_URL`. Without a declaration the row
 * exists with nothing claiming it and the cascade dashboard reports it as
 * "set but not declared". Add one of these per frontend you add.
 *
 * It is `optional` because the value only exists once the stage has deployed —
 * local and pre-deploy runs have no hostname to seed from, and the deploy gate
 * must not demand a value it is itself about to write.
 */
import { defineVariable } from '@pikku/core/variable'
import { z } from 'zod'

export const AppUrlSchema = z.string()

defineVariable({
  name: 'appUrl',
  displayName: 'App URL',
  description:
    "The web origin of this project's `app` frontend. Seeded by the deployer from the stage's assigned hostname.",
  variableId: 'APP_URL',
  schema: AppUrlSchema,
  optional: true,
})

export const VirtualUserVerifyKeySchema = z.string()

defineVariable({
  name: 'virtualUserVerifyKey',
  displayName: 'Virtual User Verify Key',
  description:
    'Public key that checks the signed statements callers outside the app present to sign in as a virtual user. Unset means no outside caller can; runs inside the app are unaffected.',
  variableId: 'VIRTUAL_USER_VERIFY_KEY',
  schema: VirtualUserVerifyKeySchema,
  optional: true,
})
