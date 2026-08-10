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
  // Never in production, whatever the flag says. Quick login provisions a
  // fixed-credential root-admin account; `pikku serve`/`pikku dev` default the
  // flag on, so a deploy that inherits that env must not carry the account with
  // it. This is the last line behind the loopback gate, not a replacement for
  // it.
  if (process.env?.NODE_ENV === 'production') return false
  const v = process.env?.PIKKU_DEV_QUICK_LOGIN
  return v === 'true' || v === '1'
}

/**
 * Headers a reverse proxy adds when it forwards a request. Their presence means
 * the request did not arrive on a direct local connection, so quick login —
 * which auto-provisions a root-admin session — must refuse regardless of what
 * they claim. `forwarded` is the RFC 7239 form; the `x-forwarded-*` pair is the
 * de-facto one nginx/Caddy/ELB emit.
 */
const PROXY_MARKERS = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]

const hostnameOf = (hostHeader: string): string => {
  try {
    // Parse through URL so a port is stripped and an IPv6 `[::1]` authority
    // normalises to `::1`, matching LOCAL_HOSTNAMES.
    return new URL(`http://${hostHeader}`).hostname
  } catch {
    return ''
  }
}

export const isDevQuickLoginRequest = (
  request: Request,
  basePath: string
): boolean => {
  if (!devQuickLoginEnabled()) return false
  const url = new URL(request.url)
  if (url.pathname !== `${basePath}${DEV_QUICK_LOGIN_SUBPATH}`) return false

  // The trust decision must not come from a forgeable header. `url.hostname` is
  // derived with X-Forwarded-Host taking precedence over Host (see
  // toWebRequest), so a remote caller behind a proxy — or one simply setting
  // the header — could present `localhost` and pass. Two rules replace it:
  //
  //   1. If any proxy-forwarding header is present, the request was relayed and
  //      is not a direct local connection. Refuse.
  //   2. Otherwise judge locality from the raw Host header alone, never the
  //      forwarded one.
  //
  // A direct `curl http://127.0.0.1:port` sets neither forwarding header and a
  // loopback Host, so the local-dev path is unaffected; a proxied request sets
  // at least one and is turned away.
  for (const marker of PROXY_MARKERS) {
    if (request.headers.get(marker)) return false
  }
  return LOCAL_HOSTNAMES.has(hostnameOf(request.headers.get('host') ?? ''))
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
