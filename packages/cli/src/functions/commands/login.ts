import open from 'open'
import { pikkuSessionlessFunc } from '#pikku'
import { deviceLogin } from '../../utils/device-auth.js'
import {
  saveSession,
  loadSession,
  clearSession,
  isSessionExpired,
  sessionFilePath,
} from '../../utils/cli-session.js'

const DEFAULT_URL = 'http://localhost:3000'

interface LoginOptions {
  url?: string
  clientId?: string
  scope?: string
  authPath?: string
  open?: boolean
}

/**
 * `pikku login` — authenticate the CLI against a pikku server using the
 * better-auth device-authorization flow. Stores a session token at
 * `~/.pikku/session.json`; generated CLI/websocket clients pick it up
 * automatically.
 */
export const login = pikkuSessionlessFunc<LoginOptions, void>({
  func: async (
    { logger },
    { url, clientId, scope, authPath, open: openBrowser }
  ) => {
    const baseURL = (url ?? DEFAULT_URL).trim()

    const session = await deviceLogin({
      baseURL,
      clientId,
      scope,
      authBasePath: authPath,
      onPrompt: async ({
        verificationUri,
        verificationUriComplete,
        userCode,
        expiresAtMs,
      }) => {
        const target = verificationUriComplete ?? verificationUri
        logger.info('')
        logger.info('  To finish signing in, open:')
        logger.info(`    ${target}`)
        logger.info('')
        logger.info(`  And confirm this code:  ${userCode}`)
        logger.info(`  (expires ${new Date(expiresAtMs).toLocaleTimeString()})`)
        logger.info('')
        logger.info('  Waiting for approval…')
        // Default to opening the browser unless explicitly disabled.
        if (openBrowser !== false) {
          try {
            await open(target)
          } catch {
            // Headless / no browser — the printed URL is the fallback.
          }
        }
      },
    })

    const path = await saveSession(session)
    const who = session.user?.email ?? session.user?.id ?? 'authenticated'
    logger.info(`✓ Logged in as ${who} on ${session.baseURL}`)
    if (session.expiresAt) {
      logger.info(
        `  Session expires ${new Date(session.expiresAt).toLocaleString()}`
      )
    }
    logger.info(`  Saved to ${path}`)
  },
})

/**
 * `pikku logout` — remove a stored session (the given `--url`, or the current
 * default).
 */
export const logout = pikkuSessionlessFunc<{ url?: string }, void>({
  func: async ({ logger }, { url }) => {
    const removed = await clearSession(url)
    if (removed) {
      logger.info(`✓ Logged out of ${removed}`)
    } else {
      logger.info('No active session to log out of.')
    }
  },
})

/**
 * `pikku whoami` — show the current (or `--url`) stored session and whether it
 * has expired.
 */
export const whoami = pikkuSessionlessFunc<{ url?: string }, void>({
  func: async ({ logger }, { url }) => {
    const session = await loadSession(url)
    if (!session) {
      logger.info('Not logged in. Run `pikku login` to authenticate.')
      return
    }
    const who = session.user?.email ?? session.user?.id ?? '(unknown user)'
    logger.info(`Logged in as ${who}`)
    logger.info(`  Server : ${session.baseURL}`)
    if (session.expiresAt) {
      const expired = isSessionExpired(session)
      logger.info(
        `  Expires: ${new Date(session.expiresAt).toLocaleString()}${expired ? ' (EXPIRED — run `pikku login` again)' : ''}`
      )
    }
    logger.info(`  Stored : ${sessionFilePath()}`)
  },
})
