import { addHTTPMiddleware } from '../.pikku/http/pikku-http-types.gen.js'
import {
  addPermission,
  pikkuMiddleware,
  pikkuPermission,
} from '../.pikku/function/pikku-function-types.gen.js'

export type E2ESession = {
  userId: string
  orgId: string
  role: 'owner' | 'manager' | 'member' | 'viewer'
}

const sessionHeaderMiddleware = pikkuMiddleware(
  async (_services, wire, next) => {
    const rawSession = wire.http?.request?.header('x-e2e-session')

    if (rawSession && wire.setSession) {
      try {
        const parsed = JSON.parse(rawSession) as E2ESession
        await wire.setSession(parsed)
      } catch {}
    }

    await next()
  }
)

export const enableSessionFromHeader = () =>
  addHTTPMiddleware('*', [sessionHeaderMiddleware])

export const requireManagerPermission = pikkuPermission(
  async (_services, _data, wire) => {
    const session = (await wire.getSession?.()) as E2ESession | undefined
    return !!session && (session.role === 'manager' || session.role === 'owner')
  }
)

export const e2eManagerTagPermission = () =>
  addPermission('e2e:manager', [requireManagerPermission])
