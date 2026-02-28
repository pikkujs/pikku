import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const JwtSignInput = z.object({
  payload: z.any().describe('The payload to encode into the JWT'),
  expiresIn: z
    .object({
      value: z.number().describe('Duration value'),
      unit: z
        .enum(['second', 'minute', 'hour', 'day', 'week', 'year'])
        .describe('Time unit'),
    })
    .describe('Token expiration time'),
})

export const JwtSignOutput = z.object({
  token: z.string().describe('The signed JWT token'),
})

export const jwtSign = pikkuSessionlessFunc({
  description: 'Sign a payload into a JWT token',
  node: { displayName: 'JWT Sign', category: 'Data', type: 'action' },
  input: JwtSignInput,
  output: JwtSignOutput,
  func: async ({ jwt }, { payload, expiresIn }) => {
    if (!jwt) {
      throw new Error('JWT service is required')
    }
    const token = await jwt.encode(expiresIn, payload)
    return { token }
  },
})

export const JwtDecodeInput = z.object({
  token: z.string().describe('The JWT token to decode'),
})

export const JwtDecodeOutput = z.object({
  payload: z.any().describe('The decoded payload'),
})

export const jwtDecode = pikkuSessionlessFunc({
  description: 'Decode a JWT token into its payload',
  node: { displayName: 'JWT Decode', category: 'Data', type: 'action' },
  input: JwtDecodeInput,
  output: JwtDecodeOutput,
  func: async ({ jwt }, { token }) => {
    if (!jwt) {
      throw new Error('JWT service is required')
    }
    const payload = await jwt.decode(token)
    return { payload }
  },
})
