import { addError, PikkuError } from '@pikku/core/errors'

/*
 * The refusals of `verifyChallenge`. Each message starts with a fixed code so a
 * client can tell them apart by the words alone, and each answers 422: the HTTP
 * error handler sends the thrown message only below 500, and 403, 404 and 409
 * mean "not allowed", "no such function" and "not running" to a client.
 */

/** No payload, an unreadable one, or one whose signature or solution fails. */
export class CaptchaInvalidError extends PikkuError {
  constructor() {
    super('CAPTCHA_INVALID: the captcha was missing or not solved')
  }
}
addError(CaptchaInvalidError, {
  status: 422,
  message: 'CAPTCHA_INVALID: the captcha was missing or not solved',
})

/** The challenge was solved after its expiry. */
export class CaptchaExpiredError extends PikkuError {
  constructor() {
    super('CAPTCHA_EXPIRED: the captcha expired, solve a new one')
  }
}
addError(CaptchaExpiredError, {
  status: 422,
  message: 'CAPTCHA_EXPIRED: the captcha expired, solve a new one',
})

/** The challenge was already used by an earlier submission. */
export class CaptchaReusedError extends PikkuError {
  constructor() {
    super('CAPTCHA_REUSED: the captcha was already used, solve a new one')
  }
}
addError(CaptchaReusedError, {
  status: 422,
  message: 'CAPTCHA_REUSED: the captcha was already used, solve a new one',
})
