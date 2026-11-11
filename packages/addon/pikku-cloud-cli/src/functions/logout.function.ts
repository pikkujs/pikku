import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import {
  readAuthFile,
  writeAuthFile,
  resolveApiContext,
} from '../lib/config.js'
import { cloudGitHost, unregisterGitHelper } from '../lib/git-credential.js'

export const CloudLogoutInput = z.object({
  apiUrl: z.string().optional(),
})

export const CloudLogoutOutput = z.object({
  ok: z.boolean(),
  apiUrl: z.string(),
})

export const CloudLogout = pikkuSessionlessFunc({
  description: 'Forget the saved cloud token and the git credential helper.',
  input: CloudLogoutInput,
  output: CloudLogoutOutput,
  func: async (_services, { apiUrl: apiUrlOverride }) => {
    const { apiUrl } = await resolveApiContext({
      apiUrlOverride,
      resolveProject: false,
    })
    const auth = await readAuthFile()
    delete auth.tokens[apiUrl]
    if (auth.defaultApiUrl === apiUrl) delete auth.defaultApiUrl
    await writeAuthFile(auth)

    const host = cloudGitHost(apiUrl)
    if (host) {
      try {
        await unregisterGitHelper(host)
      } catch (err) {
        console.warn(
          `[cloud] could not remove the git credential helper for ${host}: ${(err as Error).message}`
        )
      }
    }
    console.log(`[cloud] logged out of ${apiUrl}`)
    return { ok: true, apiUrl }
  },
})
