import { z } from 'zod'

/** The challenge as the widget takes it: signed parameters, opaque to callers. */
export const GetChallengeOutput = z.object({
  parameters: z.object({
    algorithm: z.string(),
    nonce: z.string(),
    salt: z.string(),
    cost: z.number(),
    keyLength: z.number(),
    keyPrefix: z.string(),
    keySignature: z.string().optional(),
    memoryCost: z.number().optional(),
    parallelism: z.number().optional(),
    expiresAt: z.number().optional(),
    data: z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()])
      )
      .optional(),
  }),
  signature: z.string().optional(),
})

/** The base64 payload the widget writes into the form field named `altcha`. */
export const VerifyChallengeInput = z.object({
  payload: z.string().min(1).max(16_384),
})

export const VerifyChallengeOutput = z.object({ verified: z.boolean() })
