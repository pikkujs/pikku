import {
  addHTTPMiddleware,
  authAPIKey,
  authBearer,
  authCookie,
} from '#pikku/middleware'

// @snippet start machineAuth
/**
 * The ops integrations have no browser, so they cannot carry the Better Auth
 * cookie the storefront uses. Each of these leaves an existing session alone,
 * so they compose: the first one to recognise the caller wins and the rest
 * fall through.
 */
addHTTPMiddleware('/rpc', [
  authAPIKey({ source: 'header' }),
  authBearer({
    token: {
      secretId: 'OPS_API_TOKEN',
      userSession: { userId: 'ops-integration' },
    },
  }),
  authCookie({
    name: 'shop-session',
    options: { sameSite: 'lax' },
    expiresIn: { value: 7, unit: 'day' },
  }),
])
// @snippet end machineAuth
