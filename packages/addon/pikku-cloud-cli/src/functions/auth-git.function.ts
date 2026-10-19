import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import {
  answerCredentialRequest,
  cloudGitHost,
  parseCredentialRequest,
} from '../lib/git-credential.js'

export const CloudAuthGitInput = z.object({
  operation: z.string(),
})

export const CloudAuthGitOutput = z.object({
  answer: z.string(),
})

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * The git credential helper `pikku cloud login` registers for the cloud git
 * host. Git runs it; people do not. A failure is reported on stderr and
 * answered with nothing, so git falls through to its next helper or prompt.
 */
export const CloudAuthGit = pikkuSessionlessFunc({
  description: 'Git credential helper for the cloud git server',
  input: CloudAuthGitInput,
  output: CloudAuthGitOutput,
  func: async (_services, { operation }) => {
    if (operation !== 'get') return { answer: '' }
    const request = parseCredentialRequest(await readStdin())
    try {
      const ctx = await resolveApiContext({ resolveProject: false })
      if (!ctx.token) {
        console.error('[cloud] not logged in; run `pikku cloud login`')
        return { answer: '' }
      }
      const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
      const answer = await answerCredentialRequest({
        operation,
        request,
        gitHost: cloudGitHost(ctx.apiUrl),
        invoke: (input) => rpc.invoke('getGitCredential', input),
      })
      return { answer }
    } catch (err) {
      console.error(
        `[cloud] could not get a git credential: ${err instanceof Error ? err.message : String(err)}`
      )
      return { answer: '' }
    }
  },
})

export const renderAuthGit = (
  _services: unknown,
  data: { answer: string }
): void => {
  if (data.answer) process.stdout.write(data.answer)
}
