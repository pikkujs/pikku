import { UnauthorizedError } from '../errors/errors.js'
import {
  REMOTE_JOBS_SECRET_HEADER,
  REMOTE_JOBS_SECRET_VARIABLE,
} from '../services/remote-jobs.js'
import { pikkuMiddleware } from './middleware-factories.js'

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Guards the remote job inbox. Fails closed: an unset secret rejects every
 * caller, so the routes are never open just because the deployment forgot to
 * configure one.
 */
export const remoteJobsSecret = pikkuMiddleware(
  async ({ variables }, { http }, next) => {
    const expected = await variables.get(REMOTE_JOBS_SECRET_VARIABLE)
    const provided = http?.request?.header(REMOTE_JOBS_SECRET_HEADER)
    if (
      !expected ||
      typeof provided !== 'string' ||
      !constantTimeEqual(provided, expected)
    ) {
      throw new UnauthorizedError('invalid dispatch secret')
    }
    return next()
  }
)
