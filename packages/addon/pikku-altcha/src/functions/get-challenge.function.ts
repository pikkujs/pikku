import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { GetChallengeOutput } from '../lib/altcha.schemas.js'

export const getChallenge = pikkuSessionlessFunc({
  title: 'Get Captcha Challenge',
  description:
    'Issues a signed proof-of-work challenge that expires in five minutes. Hand it to the ALTCHA widget as its `challenge`.',
  expose: true,
  auth: false,
  output: GetChallengeOutput,
  func: async ({ altcha }) => await altcha.issue(),
})
