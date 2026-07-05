import type { Logger } from '@pikku/core/services'
import type { BetterAuthInstance } from './define-auth.js'

export const DEV_QUICK_LOGIN_USER = {
  name: 'Dev Admin',
  email: 'admin@pikku.dev',
  password: 'pikku-dev-password',
}

export const DEV_QUICK_LOGIN_SUBPATH = '/dev/quick-login'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export const devQuickLoginEnabled = (): boolean => {
  if (typeof process === 'undefined') return false
  const v = process.env?.PIKKU_DEV_QUICK_LOGIN
  return v === 'true' || v === '1'
}

export const isDevQuickLoginRequest = (
  request: Request,
  basePath: string
): boolean => {
  if (!devQuickLoginEnabled()) return false
  const url = new URL(request.url)
  return (
    url.pathname === `${basePath}${DEV_QUICK_LOGIN_SUBPATH}` &&
    LOCAL_HOSTNAMES.has(url.hostname)
  )
}

const ensureDevAdmin = async (
  auth: BetterAuthInstance,
  logger: Logger | undefined
): Promise<void> => {
  const { name, email, password } = DEV_QUICK_LOGIN_USER
  try {
    await auth.api.signUpEmail({ body: { name, email, password } })
  } catch {}
  try {
    const ctx = await (auth as any).$context
    const found = await ctx?.internalAdapter?.findUserByEmail?.(email)
    if (found?.user && found.user.role !== 'admin') {
      await ctx.internalAdapter.updateUser(found.user.id, { role: 'admin' })
    }
  } catch (error) {
    logger?.warn?.(
      `dev quick login: could not promote ${email} to admin: ${error}`
    )
  }
}

export const handleDevQuickLogin = async (
  auth: BetterAuthInstance,
  request: Request,
  logger?: Logger
): Promise<Response> => {
  if (request.method === 'GET') {
    return Response.json({
      enabled: true,
      email: DEV_QUICK_LOGIN_USER.email,
    })
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  await ensureDevAdmin(auth, logger)
  const { email, password } = DEV_QUICK_LOGIN_USER
  return (await auth.api.signInEmail({
    body: { email, password },
    headers: request.headers,
    asResponse: true,
  })) as Response
}
