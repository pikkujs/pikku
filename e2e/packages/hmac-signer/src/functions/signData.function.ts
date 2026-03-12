import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const SignDataInput = z.object({
  message: z.string(),
})

export const SignDataOutput = z.object({
  signature: z.string(),
})

export const signData = pikkuSessionlessFunc({
  description: 'Signs a message with HMAC using the wire credential',
  input: SignDataInput,
  output: SignDataOutput,
  func: async ({ hmacSigner }, { message }) => {
    return { signature: hmacSigner.sign(message) }
  },
})
