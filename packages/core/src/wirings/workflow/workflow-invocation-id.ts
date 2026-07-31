import { createHash } from 'node:crypto'

const PIKKU_WORKFLOW_NAMESPACE = '70696b6b-7500-5770-9f6c-6f77000a0001'

const parseUuid = (uuid: string): Buffer =>
  Buffer.from(uuid.replace(/-/g, ''), 'hex')

const formatUuid = (bytes: Buffer): string => {
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export const uuidv5 = (
  name: string,
  namespace: string = PIKKU_WORKFLOW_NAMESPACE
): string => {
  const hash = createHash('sha1')
    .update(parseUuid(namespace))
    .update(name, 'utf8')
    .digest()
  const bytes = hash.subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  return formatUuid(bytes)
}

export const deriveInvocationId = (runId: string, stepName: string): string =>
  uuidv5(`${runId}:${stepName}`)
