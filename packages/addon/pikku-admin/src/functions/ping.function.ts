import { pikkuFunc } from '#pikku/addon/function'

/**
 * Answers "am I wired?" and nothing else.
 *
 * The console UI ships with screens for users, roles and scopes, credentials
 * and the audit trail, but the app serving it may never have wired this addon.
 * Those screens probe for this function so they can say the addon is not
 * enabled, instead of failing one request at a time.
 *
 * The probe discriminates on `RPCNotFoundError` (404), not on success: name
 * resolution runs before the session check, so an unwired addon 404s even for
 * an anonymous caller, while a wired one answers 200 — or 401/403 if the host
 * gated it with `wireAddon({ auth: true })` or the caller lacks a role. Every
 * one of those means *wired*, which is the only thing the screens need to know.
 *
 * It carries no scopes for the same reason: narrowing who may learn a fact the
 * served UI already implies would only turn a clear answer into a 403.
 */
export const ping = pikkuFunc<null, { pong: true }>({
  title: 'Ping',
  description:
    'Health check for the Pikku Admin addon. The console UI probes it to tell "addon not installed" apart from a real failure.',
  expose: true,
  func: async () => {
    return { pong: true }
  },
})
