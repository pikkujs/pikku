import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const VerifySignatureInput = z.object({
  message: z.string(),
  signature: z.string(),
})

export const VerifySignatureOutput = z.object({
  valid: z.boolean(),
})

export const verifySignature = pikkuSessionlessFunc({
  description: 'Verifies an HMAC signature using the wire credential',
  input: VerifySignatureInput,
  output: VerifySignatureOutput,
  func: async ({ hmacSigner }, { message, signature }) => {
    return { valid: hmacSigner.verify(message, signature) }
  },
})
