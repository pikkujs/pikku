import type { Logger } from '@pikku/core/services'
import type { BetterAuthInstance } from './define-auth.js'

/**
 * The seeded local-development admin the quick-login endpoint signs in as. The
 * credentials are fixed and well-known on purpose: the endpoint only exists
 * when PIKKU_DEV_QUICK_LOGIN is set (the pikku dev server sets it) AND the
 * request host is a loopback address, so they never guard anything remote.
 */
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

/**
 * True when `request` targets the quick-login route AND the effective host is
 * a loopback address. The host check is defense-in-depth on top of the env
 * opt-in — a deployment that somehow ships with the flag set still refuses
 * requests addressed to a real hostname.
 */
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
  } catch {
    // Almost always "user already exists"; if sign-up failed for another
    // reason the sign-in below surfaces it as a proper auth error response.
  }
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

/**
 * Handles the dev-only quick-login route. GET reports availability so the
 * console can decide whether to render the button; POST seeds the dev admin
 * (idempotently) and returns better-auth's own sign-in response, so the
 * session cookie is set exactly as a manual sign-in would.
 */
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
