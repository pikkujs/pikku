import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const GetProfileInput = z.object({})

export const GetProfileOutput = z.object({
  authenticated: z.boolean(),
  token: z.string(),
})

export const getProfile = pikkuSessionlessFunc({
  description: 'Returns the authenticated user profile using OAuth credentials',
  input: GetProfileInput,
  output: GetProfileOutput,
  func: async ({ oauthApiClient }) => {
    return oauthApiClient.getProfile()
  },
})
