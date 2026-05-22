import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import {
  readAuthFile,
  writeAuthFile,
  resolveApiContext,
} from '../lib/config.js'
import { getRpc } from '../lib/http.js'
import { deriveConsoleUrl } from '../lib/console-url.js'

export const FabricLoginInput = z.object({
  apiKey: z.string().optional(),
  token: z.string().optional(),
  apiUrl: z.string().optional(),
  consoleUrl: z.string().optional(),
})

export const FabricLoginOutput = z.object({
  ok: z.boolean(),
  apiUrl: z.string(),
})

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Device-authorization-style CLI login. Server mints a short code, user types
 * it on the console's /cli-auth page (logging in via Auth.js if not already
 * signed in). CLI polls until the row flips to 'confirmed' and grabs the
 * one-shot bearer.
 */
export const FabricLogin = pikkuSessionlessFunc({
  description: 'Authenticate the CLI against fabric-api via a one-time code.',
  input: FabricLoginInput,
  output: FabricLoginOutput,
  func: async (
    _services,
    { apiKey, token, apiUrl: apiUrlOverride, consoleUrl: consoleUrlOverride }
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
    const rpc = getRpc({ apiUrl, token: null })

    const { code, expiresAt } = await rpc.invoke('requestCliAuth')

    console.log('')
    console.log('  Enter this code at:')
    console.log(`    ${consoleUrl}/cli-auth`)
    console.log('')
    console.log(`  Code: ${code}`)
    console.log(`  (expires ${new Date(expiresAt).toLocaleTimeString()})`)
    console.log('')
    console.log('  Waiting for confirmation…')

    const deadline = Date.now() + POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const result = await rpc.invoke('pollCliAuth', { code })
      if (result.status === 'expired') {
        throw new Error(
          'Code expired before confirmation. Run `pikku fabric login` again.'
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
