import { defineTables } from '@pikku/core/db'

/**
 * The one table this addon ships. A solved challenge is single-use, so its
 * signature is recorded here and a second submission of the same payload hits
 * the primary key. `expiry` is the instant after which the challenge could not
 * have been solved; rows past it are pruned.
 * Every name carries the prefix the consumer wires the addon under (`captcha_`).
 */
export const tables = defineTables({
  captchaUsedChallenge: {
    columns: {
      id: { type: 'key', primaryKey: true },
      expiry: { type: 'timestamptz', required: true },
    },
  },
})
