import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { decodeText, encodeBytes } from '../../bytes.js'
import { hashText, hmacText } from '../../digest.js'

export const CryptoInput = z.object({
  operation: z
    .enum([
      'hash',
      'hmac',
      'randomBytes',
      'uuid',
      'base64Encode',
      'base64Decode',
      'hexEncode',
      'hexDecode',
    ])
    .describe('The cryptographic operation to perform'),
  data: z
    .string()
    .optional()
    .describe('Input data for hash/hmac/encode/decode operations'),
  algorithm: z
    .enum(['md5', 'sha1', 'sha256', 'sha384', 'sha512'])
    .optional()
    .describe('Hash algorithm for hash/hmac operations'),
  key: z.string().optional().describe('Secret key for hmac operation'),
  length: z
    .number()
    .optional()
    .describe('Number of bytes for randomBytes operation'),
  encoding: z
    .enum(['hex', 'base64'])
    .optional()
    .describe('Output encoding for hash/hmac operations'),
})

export const CryptoOutput = z.object({
  result: z.string().describe('The result of the cryptographic operation'),
})

type Input = z.infer<typeof CryptoInput>
type Output = z.infer<typeof CryptoOutput>

export const crypto = pikkuSessionlessFunc({
  description: 'Provide cryptographic utilities',
  node: { displayName: 'Crypto', category: 'Data', type: 'action' },
  input: CryptoInput,
  output: CryptoOutput,
  func: async (_services, data: Input): Promise<Output> => {
    let result: string

    switch (data.operation) {
      case 'hash': {
        result = await hashText(
          data.algorithm ?? 'sha256',
          data.data ?? '',
          data.encoding ?? 'hex'
        )
        break
      }
      case 'hmac': {
        result = await hmacText(
          data.algorithm ?? 'sha256',
          data.key ?? '',
          data.data ?? '',
          data.encoding ?? 'hex'
        )
        break
      }
      case 'randomBytes': {
        const bytes = new Uint8Array(data.length ?? 32)
        // getRandomValues is capped at 65536 bytes per call.
        for (let i = 0; i < bytes.length; i += 65536) {
          globalThis.crypto.getRandomValues(bytes.subarray(i, i + 65536))
        }
        result = encodeBytes(bytes, 'hex')
        break
      }
      case 'uuid': {
        result = globalThis.crypto.randomUUID()
        break
      }
      case 'base64Encode': {
        result = encodeBytes(decodeText(data.data ?? ''), 'base64')
        break
      }
      case 'base64Decode': {
        result = encodeBytes(decodeText(data.data ?? '', 'base64'))
        break
      }
      case 'hexEncode': {
        result = encodeBytes(decodeText(data.data ?? ''), 'hex')
        break
      }
      case 'hexDecode': {
        result = encodeBytes(decodeText(data.data ?? '', 'hex'))
        break
      }
      default:
        result = ''
    }

    return { result }
  },
})
