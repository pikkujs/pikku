import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { CaptchaReusedError } from '../lib/altcha-errors.js'
import {
  VerifyChallengeInput,
  VerifyChallengeOutput,
} from '../lib/altcha.schemas.js'

/**
 * Not exposed over `/rpc`: an application function calls it before its own
 * write, as `rpc.invoke('captcha:verifyChallenge', { payload })`. It throws
 * when the payload fails, and a returned `verified: true` means the challenge
 * is now spent.
 */
export const verifyChallenge = pikkuSessionlessFunc({
  title: 'Verify Captcha Challenge',
  description:
    'Checks a solved ALTCHA payload and spends it. Refuses a missing, invalid, expired or already used one.',
  input: VerifyChallengeInput,
  output: VerifyChallengeOutput,
  func: async ({ kysely, altcha }, { payload }) => {
    const { id, expiry } = await altcha.check(payload)
    await kysely
      .deleteFrom('captcha_used_challenge')
      .where('expiry', '<', new Date())
      .execute()
    // The primary key makes the claim atomic: of two concurrent submissions of
    // one solution, exactly one inserts a row.
    const claimed = await kysely
      .insertInto('captcha_used_challenge')
      .values({ id, expiry: new Date(expiry) })
      .onConflict((oc) => oc.column('id').doNothing())
      .executeTakeFirst()
    if (!claimed.numInsertedOrUpdatedRows) throw new CaptchaReusedError()
    return { verified: true }
  },
})
