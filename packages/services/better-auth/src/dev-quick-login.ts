import type { Logger, ScopeService } from '@pikku/core/services'
import type { BetterAuthInstance } from './define-auth.js'
import { ADMIN_SCOPE_ROOT } from './auth-scopes.js'

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

/**
 * Signs the dev user up (idempotently) and grants it the `admin` scope, which
 * covers every `admin:*` capability the framework gates on.
 *
 * The grant needs the `admin` scope to be declared and synced — an app that has
 * not declared it gets a warning rather than a failed login, because quick
 * login's job is to get a session, and a scopeless dev user is still useful.
 */
const ensureDevAdmin = async (
  auth: BetterAuthInstance,
  logger: Logger | undefined,
  scopeService: ScopeService | undefined
): Promise<void> => {
  const { name, email, password } = DEV_QUICK_LOGIN_USER
  try {
    await auth.api.signUpEmail({ body: { name, email, password } })
  } catch {}
  if (!scopeService) {
    logger?.warn?.(
      `dev quick login: no ScopeService registered, so ${email} holds no admin scope`
    )
    return
  }
  try {
    const ctx = await (auth as any).$context
    const found = await ctx?.internalAdapter?.findUserByEmail?.(email)
    if (!found?.user) {
      return
    }
    const held = await scopeService.listUserScopes(found.user.id)
    if (!held.includes(ADMIN_SCOPE_ROOT)) {
      await scopeService.addScopeToUser(found.user.id, ADMIN_SCOPE_ROOT)
    }
  } catch (error) {
    logger?.warn?.(
      `dev quick login: could not grant '${ADMIN_SCOPE_ROOT}' to ${email}: ${error}`
    )
  }
}

export const handleDevQuickLogin = async (
  auth: BetterAuthInstance,
  request: Request,
  logger?: Logger,
  scopeService?: ScopeService
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
  await ensureDevAdmin(auth, logger, scopeService)
  const { email, password } = DEV_QUICK_LOGIN_USER
  return (await auth.api.signInEmail({
    body: { email, password },
    headers: request.headers,
    asResponse: true,
  })) as Response
}
