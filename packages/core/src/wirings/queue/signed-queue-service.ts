import type { Logger } from '../../services/logger.js'
import type { SecretService } from '../../services/secret-service.js'
import {
  getQueueIdentitySecret,
  signQueueIdentity,
  warnQueueIdentitySecretMissing,
} from './queue-identity.js'
import type { JobOptions, QueueJob, QueueService } from './queue.types.js'

/**
 * Wraps any {@link QueueService} so `JobOptions.pikkuUserId` leaves the process
 * as a signed claim that `runQueueJob` can verify.
 */
export class SignedQueueService implements QueueService {
  constructor(
    private readonly queueService: QueueService,
    private readonly secrets: SecretService,
    private readonly logger: Logger
  ) {}

  get supportsResults(): boolean {
    return this.queueService.supportsResults
  }

  public async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const pikkuUserId = options?.pikkuUserId
    if (!pikkuUserId) {
      return this.queueService.add(queueName, data, options)
    }

    const secret = await getQueueIdentitySecret(this.secrets)
    if (!secret) {
      warnQueueIdentitySecretMissing(this.logger)
      const { pikkuUserId: _unsigned, ...rest } = options as JobOptions
      return this.queueService.add(queueName, data, rest)
    }

    const signed = await signQueueIdentity(secret, pikkuUserId, {
      queueName,
      jobId: undefined,
      data,
    })
    return this.queueService.add(queueName, data, {
      ...options,
      pikkuUserId: signed,
    })
  }

  public async getJob<T, R>(
    queueName: string,
    jobId: string
  ): Promise<QueueJob<T, R> | null> {
    return this.queueService.getJob<T, R>(queueName, jobId)
  }
}
