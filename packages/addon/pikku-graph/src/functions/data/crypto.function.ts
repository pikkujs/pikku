import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto'

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
        const algorithm = data.algorithm ?? 'sha256'
        const encoding = data.encoding ?? 'hex'
        const hash = createHash(algorithm)
        hash.update(data.data ?? '')
        result = hash.digest(encoding)
        break
      }
      case 'hmac': {
        const algorithm = data.algorithm ?? 'sha256'
        const encoding = data.encoding ?? 'hex'
        const hmac = createHmac(algorithm, data.key ?? '')
        hmac.update(data.data ?? '')
        result = hmac.digest(encoding)
        break
      }
      case 'randomBytes': {
        const length = data.length ?? 32
        result = randomBytes(length).toString('hex')
        break
      }
      case 'uuid': {
        result = randomUUID()
        break
      }
      case 'base64Encode': {
        result = Buffer.from(data.data ?? '').toString('base64')
        break
      }
      case 'base64Decode': {
        result = Buffer.from(data.data ?? '', 'base64').toString('utf-8')
        break
      }
      case 'hexEncode': {
        result = Buffer.from(data.data ?? '').toString('hex')
        break
      }
      case 'hexDecode': {
        result = Buffer.from(data.data ?? '', 'hex').toString('utf-8')
        break
      }
      default:
        result = ''
    }

    return { result }
  },
})
