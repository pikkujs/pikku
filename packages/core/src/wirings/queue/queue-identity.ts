import {
  decodeBase64UrlText,
  encodeBase64UrlText,
  signWithKeyMaterial,
  verifyWithKeyMaterial,
} from '../../crypto-utils.js'
import type { Logger } from '../../services/logger.js'
import type { SecretService } from '../../services/secret-service.js'

export const QUEUE_IDENTITY_SECRET_NAME = 'PIKKU_QUEUE_IDENTITY_SECRET'

/** Namespaces the queue signing key away from every other use of the same material. */
export const QUEUE_IDENTITY_INFO = 'pikku:queue-identity'

export const QUEUE_IDENTITY_CLAIM_VERSION = 'pq1'

/**
 * What the signature is bound to. `jobId` is only enforced when the producer
 * knew it at signing time — most adapters mint their own id after `add`.
 */
export interface QueueIdentityBinding {
  queueName: string
  jobId?: string
  data: unknown
}

interface QueueIdentityClaim {
  u: string
  q: string
  j?: string
}

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

/**
 * Round-trips through JSON first so the producer hashes exactly what the
 * transport will deliver, then sorts keys so property order cannot change the
 * digest.
 */
const canonicalizePayload = (data: unknown): string =>
  stableStringify(JSON.parse(JSON.stringify(data ?? null)))

const signingPayload = (encodedClaim: string, data: unknown): string =>
  `${QUEUE_IDENTITY_CLAIM_VERSION}.${encodedClaim}.${canonicalizePayload(data)}`

export const getQueueIdentitySecret = async (
  secrets?: SecretService
): Promise<string | undefined> => {
  try {
    return (
      (await secrets?.getSecret(QUEUE_IDENTITY_SECRET_NAME))?.reveal() ||
      undefined
    )
  } catch {
    return undefined
  }
}

export const signQueueIdentity = async (
  secret: string,
  pikkuUserId: string,
  binding: QueueIdentityBinding
): Promise<string> => {
  const claim: QueueIdentityClaim = {
    u: pikkuUserId,
    q: binding.queueName,
    ...(binding.jobId ? { j: binding.jobId } : {}),
  }
  const encodedClaim = encodeBase64UrlText(JSON.stringify(claim))
  const signature = await signWithKeyMaterial(
    QUEUE_IDENTITY_SECRET_NAME,
    secret,
    QUEUE_IDENTITY_INFO,
    signingPayload(encodedClaim, binding.data)
  )
  return `${QUEUE_IDENTITY_CLAIM_VERSION}.${encodedClaim}.${signature}`
}

/** The claimed user id, or undefined for anything that does not verify. */
export const verifyQueueIdentity = async (
  secret: string,
  token: string,
  binding: QueueIdentityBinding
): Promise<string | undefined> => {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  const [version, encodedClaim, signature] = parts as [string, string, string]
  if (version !== QUEUE_IDENTITY_CLAIM_VERSION) return undefined

  const verified = await verifyWithKeyMaterial(
    QUEUE_IDENTITY_SECRET_NAME,
    secret,
    QUEUE_IDENTITY_INFO,
    signingPayload(encodedClaim, binding.data),
    signature
  )
  if (!verified) return undefined

  let claim: QueueIdentityClaim
  try {
    claim = JSON.parse(decodeBase64UrlText(encodedClaim)) as QueueIdentityClaim
  } catch {
    return undefined
  }
  if (typeof claim?.u !== 'string' || claim.u.length === 0) return undefined
  if (claim.q !== binding.queueName) return undefined
  if (claim.j !== undefined && claim.j !== binding.jobId) return undefined
  return claim.u
}

let missingSecretLogged = false

/** Test seam: the latch is process-wide so the warning is emitted once. */
export const resetQueueIdentityLogLatch = () => {
  missingSecretLogged = false
}

export const warnQueueIdentitySecretMissing = (logger: Logger) => {
  if (missingSecretLogged) return
  missingSecretLogged = true
  logger.warn(
    `No '${QUEUE_IDENTITY_SECRET_NAME}' secret is configured — queue job identities cannot be signed or verified, so pikkuUserId is dropped and queue workers run without one.`
  )
}

export const resolveQueueJobIdentity = async ({
  claimedIdentity,
  binding,
  secrets,
  logger,
}: {
  claimedIdentity: string | undefined
  binding: QueueIdentityBinding
  secrets: SecretService | undefined
  logger: Logger
}): Promise<string | undefined> => {
  if (!claimedIdentity) return undefined

  const secret = await getQueueIdentitySecret(secrets)
  if (!secret) {
    warnQueueIdentitySecretMissing(logger)
    return undefined
  }

  let pikkuUserId: string | undefined
  try {
    pikkuUserId = await verifyQueueIdentity(secret, claimedIdentity, binding)
  } catch (error) {
    logger.error(
      `Could not verify the identity claim on job ${binding.jobId} in queue ${binding.queueName} — the job runs without a pikkuUserId.`,
      error
    )
    return undefined
  }

  if (!pikkuUserId) {
    logger.error(
      `Rejected an unsigned or invalid identity claim on job ${binding.jobId} in queue ${binding.queueName} — the job runs without a pikkuUserId.`
    )
    return undefined
  }

  return pikkuUserId
}
