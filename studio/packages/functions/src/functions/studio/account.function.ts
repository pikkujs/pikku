import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { KEY_PROVIDERS, SUBSCRIPTION_PROVIDERS } from '@pikku/studio'

const SignInChoice = z.enum(['local', 'fabric']).nullable()

const AiChoice = z
  .union([
    z.object({ kind: z.literal('key'), provider: z.string(), model: z.string() }),
    z.object({ kind: z.literal('subscription'), provider: z.string() }),
    z.object({ kind: z.literal('fabric') }),
  ])
  .nullable()

const Settings = z.object({ signIn: SignInChoice })

export const AccountInput = z.object({})

export const AccountOutput = z.object({
  signIn: SignInChoice,
  ai: AiChoice,
  signedIn: z.boolean(),
  apiUrl: z.string(),
  consoleUrl: z.string(),
})

export const account = pikkuSessionlessFunc({
  description: 'The sign-in choice, the AI choice and the Fabric account.',
  input: AccountInput,
  output: AccountOutput,
  func: async ({ studio }) => {
    const [current, account] = await Promise.all([studio.settings.read(), studio.projects.getAccount()])
    const signIn = current.signIn === 'fabric' && !account.signedIn ? null : current.signIn
    return { signIn, ai: await studio.ai.choice(), ...account }
  },
})

export const AiOptionsInput = z.object({})

export const AiOptionsOutput = z.object({
  keys: z.array(
    z.object({ id: z.string(), name: z.string(), envVar: z.string(), baseUrl: z.string(), model: z.string() })
  ),
  subscriptions: z.array(z.object({ id: z.string(), name: z.string(), piLogin: z.string() })),
})

export const aiOptions = pikkuSessionlessFunc({
  description: 'The AI providers Studio can build with.',
  input: AiOptionsInput,
  output: AiOptionsOutput,
  func: async () => ({ keys: KEY_PROVIDERS, subscriptions: SUBSCRIPTION_PROVIDERS }),
})

export const SetAiInput = z.union([
    z.object({ kind: z.literal('fabric') }),
    z.object({ kind: z.literal('key'), provider: z.string(), apiKey: z.string(), model: z.string().optional() }),
    z.object({ kind: z.literal('subscription'), provider: z.string() }),
  ])

export const setAi = pikkuSessionlessFunc({
  description: 'Choose the AI Studio builds with.',
  input: SetAiInput,
  func: async ({ studio }, input) => studio.ai.set(input),
})

export const ChangeAiInput = z.object({})

export const changeAi = pikkuSessionlessFunc({
  description: 'Forget the AI choice.',
  input: ChangeAiInput,
  func: async ({ studio }) => {
    await studio.ai.clear()
    return null
  },
})

export const UseLocallyInput = z.object({})

export const UseLocallyOutput = Settings

export const useLocally = pikkuSessionlessFunc({
  description: 'Use Studio without a Fabric account.',
  input: UseLocallyInput,
  output: UseLocallyOutput,
  func: async ({ studio }) => studio.settings.update({ signIn: 'local' }),
})

export const StartSignInInput = z.object({})

export const startSignIn = pikkuSessionlessFunc({
  description: 'Start signing in to Fabric with a device code.',
  input: StartSignInInput,
  func: async ({ studio }) => studio.projects.startSignIn(),
})

export const PollSignInInput = z.object({ code: z.string() })

export const PollSignInOutput = z.object({ status: z.enum(['pending', 'confirmed', 'expired', 'rejected']) })

export const pollSignIn = pikkuSessionlessFunc({
  description: 'Check whether a Fabric sign-in was confirmed.',
  input: PollSignInInput,
  output: PollSignInOutput,
  func: async ({ studio }, { code }) => {
    const status = await studio.projects.pollSignIn(code)
    if (status === 'confirmed') {
      await studio.settings.update({ signIn: 'fabric' })
      if (!(await studio.ai.choice())) await studio.ai.set({ kind: 'fabric' })
    }
    return { status }
  },
})

export const SignOutInput = z.object({})

export const SignOutOutput = Settings

export const signOut = pikkuSessionlessFunc({
  description: 'Sign out of Fabric, or stop using Studio locally.',
  input: SignOutInput,
  output: SignOutOutput,
  func: async ({ studio }) => {
    const current = await studio.settings.read()
    if (current.signIn === 'fabric') {
      await studio.projects.signOut()
      if ((await studio.ai.choice())?.kind === 'fabric') await studio.ai.clear()
    }
    return studio.settings.update({ signIn: null })
  },
})
