import { z } from 'zod'
import { spawn } from 'node:child_process'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import {
  readAuthFile,
  writeAuthFile,
  resolveApiContext,
} from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { deriveConsoleUrl } from '../lib/console-url.js'

export const FabricLoginInput = z.object({
  apiKey: z.string().optional(),
  token: z.string().optional(),
  apiUrl: z.string().optional(),
  consoleUrl: z.string().optional(),
  browser: z.boolean().optional(),
})

export const FabricLoginOutput = z.object({
  ok: z.boolean(),
  apiUrl: z.string(),
})

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Best-effort browser launch. The URL is always printed first, so a failure
 * here costs the user a click, not the login — hence a warning rather than a
 * throw. Skipped over SSH and in CI, where opening a browser on the wrong
 * machine is worse than not opening one.
 */
function openBrowser(url: string): void {
  if (process.env.SSH_TTY || process.env.CI) return
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open'
  try {
    const child = spawn(cmd, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    })
    child.on('error', (err) =>
      console.warn(`[fabric] could not open a browser (${err.message}) — open the URL above.`)
    )
    child.unref()
  } catch (err) {
    console.warn(
      `[fabric] could not open a browser (${(err as Error).message}) — open the URL above.`
    )
  }
}

/**
 * Device-authorization-style CLI login. Server mints a short code, user types
 * it on the console's /cli-auth page (logging in via Better Auth if not already
 * signed in). CLI polls until the row flips to 'confirmed' and grabs the
 * one-shot bearer.
 */
export const FabricLogin = pikkuSessionlessFunc({
  description: 'Authenticate the CLI against fabric-api via a one-time code.',
  input: FabricLoginInput,
  output: FabricLoginOutput,
  func: async (
    _services,
    {
      apiKey,
      token,
      apiUrl: apiUrlOverride,
      consoleUrl: consoleUrlOverride,
      browser,
    }
  ) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    const apiUrl = ctx.apiUrl

    // Static-token fast paths — useful for CI and "I already have a token".
    const explicit = apiKey ?? token
    if (explicit) {
      const auth = await readAuthFile()
      auth.tokens[apiUrl] = explicit
      await writeAuthFile(auth)
      console.log(`[fabric] saved token for ${apiUrl}`)
      return { ok: true, apiUrl }
    }

    const consoleUrl = (consoleUrlOverride ?? deriveConsoleUrl(apiUrl)).replace(
      /\/$/,
      ''
    )
    const rpc = getFabricRPC({ apiUrl, token: null })

    const { code, expiresAt } = await rpc.invoke('requestCliAuth')

    // Deliberately no ?code= — the browser opens the page, but the code is
    // typed. That hand-off is what proves the person authorizing the token is
    // the person who ran this command; a link carrying its own code is a
    // one-click grant for anyone who can put it in front of a signed-in user.
    const authUrl = `${consoleUrl}/cli-auth`

    console.log('')
    console.log('  Enter this code to finish signing in:')
    console.log(`    ${code}`)
    console.log('')
    console.log(`  at ${authUrl}`)
    console.log(`  (expires ${new Date(expiresAt).toLocaleTimeString()})`)
    console.log('')
    console.log('  Waiting for confirmation…')

    if (browser !== false) openBrowser(authUrl)

    const deadline = Date.now() + POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const result = await rpc.invoke('pollCliAuth', { code })
      if (result.status === 'expired') {
        throw new Error(
          'Code expired before confirmation. Run `pikku fabric login` again.'
        )
      }
      // Distinct from expired: the user pressed Cancel, so stop immediately
      // rather than sitting here until the TTL runs out.
      if (result.status === 'rejected') {
        throw new Error(
          'Sign-in was cancelled in the browser. Run `pikku fabric login` again to retry.'
        )
      }
      if (result.status === 'confirmed' && result.token) {
        const auth = await readAuthFile()
        auth.tokens[apiUrl] = result.token
        await writeAuthFile(auth)
        console.log(`[fabric] logged in; token saved for ${apiUrl}`)
        return { ok: true, apiUrl }
      }
    }
    throw new Error('Login timed out.')
  },
})
