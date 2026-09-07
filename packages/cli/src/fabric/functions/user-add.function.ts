import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { getFabricRPC } from '../lib/http.js'
import { promptSecret } from '../lib/prompt.js'
import { resolveStage } from '../lib/stage.js'

export const FabricUserAddInput = z.object({
  email: z.string(),
  branch: z.string().optional(),
  password: z.string().optional(),
  name: z.string().optional(),
})

export const FabricUserAddOutput = z.object({
  email: z.string(),
  userId: z.string(),
  branch: z.string(),
  // Only set when we generated the password, so the caller can hand it over.
  // Omitted when the operator supplied one — we never echo a value they chose.
  generatedPassword: z.string().optional(),
})

// A readable one-off password when the operator doesn't supply one: enough
// entropy to be safe (16 bytes), base64url so it survives copy/paste and shell
// quoting. The user is expected to reset it after first sign-in.
const generatePassword = (): string => randomBytes(16).toString('base64url')

/**
 * Create an end-user directly on a deployed stage — the CLI equivalent of the
 * console's "Add user", for provisioning the first account when sign-up is
 * disabled (or any account out of band).
 *
 * How it reaches the stage: fabric mints a short-lived operator token for the
 * stage (`createStageOperatorToken`), which the stage's `fabric()` plugin
 * verifies against FABRIC_AUTH_PUBLIC_KEY (scoped to the stage via the token's
 * audience). That token carries the operator scope roots (`admin`,
 * `virtualUser`), and `admin` parent-satisfies `admin:users:create`, so the
 * stage's own `admin:createUser` RPC (from `@pikku/addon-admin`) accepts it.
 * We call that RPC directly rather than through a fabric broker, so this works
 * against the currently deployed fabric with no server change.
 */
export const FabricUserAdd = pikkuSessionlessFunc({
  description:
    "Create an end-user on a deployed stage (the CLI form of the console's Add user).",
  input: FabricUserAddInput,
  output: FabricUserAddOutput,
  func: async (_services, { email, branch: requested, name, password }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new FabricPreconditionError(
        'Not logged in. Run `pikku fabric login` first.'
      )
    if (!ctx.projectId)
      throw new FabricPreconditionError(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    // A blank prompt means "generate one for me" — the common case for
    // bootstrapping the first admin, where there is no password to type yet.
    let generatedPassword: string | undefined
    let plaintext =
      password ??
      (await promptSecret(`${email} password (blank to auto-generate)`, {
        nonInteractiveHint: `Pass the password with \`--password\`, or pipe it: \`echo '<password>' | pikku fabric user add ${email}\`.`,
      }))
    if (!plaintext) {
      plaintext = generatePassword()
      generatedPassword = plaintext
    }

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )

    // Operator token + the stage's own app URL. Short-lived; minted per call so
    // nothing durable holds a stage credential.
    const { token, appUrl } = await rpc.invoke('createStageOperatorToken', {
      stageId,
    })

    // POST the stage's own RPC with the operator token and a { rpcName, data }
    // body — the same shape `proxyStageConsoleRpc` uses server-side. A
    // Fabric-hosted stage serves its frontend at the root and the pikku API
    // under `/api`, so the RPC endpoint is `${appUrl}/api/rpc/<name>` (posting
    // to `${appUrl}/rpc/...` returns the SPA HTML, not the API).
    const rpcName = 'admin:createUser'
    const response = await fetch(
      `${appUrl}/api/rpc/${encodeURIComponent(rpcName)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rpcName,
          data: { email, password: plaintext, ...(name ? { name } : {}) },
        }),
      }
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      if (response.status === 404) {
        throw new FabricPreconditionError(
          `This stage does not expose ${rpcName} — it has not wired @pikku/addon-admin (as "admin"). Nothing was created.`
        )
      }
      throw new FabricPreconditionError(
        body ||
          `Stage rejected ${rpcName} (${response.status}). Nothing was created.`
      )
    }

    const body = await response.text()
    const parsed = (body ? JSON.parse(body) : null) as {
      userId?: string
    } | null
    if (!parsed?.userId) {
      throw new FabricPreconditionError(
        `Stage accepted ${rpcName} but returned no userId: ${body}`
      )
    }

    console.log(
      `[fabric] created ${email} on ${branch} (userId ${parsed.userId}).`
    )
    if (generatedPassword) {
      console.log(`[fabric] generated password: ${generatedPassword}`)
      console.log(
        '[fabric] hand this over securely; have them reset it after first sign-in.'
      )
    }

    return {
      email,
      userId: parsed.userId,
      branch,
      ...(generatedPassword ? { generatedPassword } : {}),
    }
  },
})
