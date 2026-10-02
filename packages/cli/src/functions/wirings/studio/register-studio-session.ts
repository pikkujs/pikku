import { timingSafeEqual } from 'node:crypto'
import { addGlobalMiddleware, pikkuMiddleware } from '@pikku/core/middleware'

export const STUDIO_HEADER = 'x-pikku-studio'

export const STUDIO_SESSION = { userId: 'studio', scopes: ['pikku:console'] }

const matches = (presented: string, token: string) => {
  const a = Buffer.from(presented)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const studioSession = (token: string) =>
  pikkuMiddleware(async (_services, { http, session, setSession }, next) => {
    const presented = http?.request?.header(STUDIO_HEADER)
    if (!session && setSession && typeof presented === 'string' && matches(presented, token)) {
      await setSession({ ...STUDIO_SESSION, scopes: [...STUDIO_SESSION.scopes] })
    }
    return next()
  })

export const registerStudioSession = (token: string | undefined = process.env.PIKKU_STUDIO_TOKEN) => {
  if (!token || token.length < 32) return false
  addGlobalMiddleware([studioSession(token)])
  return true
}
