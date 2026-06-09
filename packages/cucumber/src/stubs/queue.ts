export interface QueueWireConfig {
  queueName: string
  jobId?: string
  pikkuUserId?: string
}

export interface StubQueueWire {
  wire: {
    queueName: string
    jobId: string
    pikkuUserId?: string
    updateProgress(progress: number | string | object): Promise<void>
    fail(reason?: string): Promise<void>
    discard(reason?: string): Promise<void>
  }
  readonly progressUpdates: (number | string | object)[]
  readonly failedWith: string | undefined
  readonly discardedWith: string | undefined
}

export function createStubQueueWire(config: QueueWireConfig): StubQueueWire {
  const progressUpdates: (number | string | object)[] = []
  let failedWith: string | undefined
  let discardedWith: string | undefined

  const wire = {
    queueName: config.queueName,
    jobId: config.jobId ?? 'test-job-id',
    pikkuUserId: config.pikkuUserId,
    async updateProgress(progress: number | string | object) {
      progressUpdates.push(progress)
    },
    async fail(reason?: string) {
      failedWith = reason
    },
    async discard(reason?: string) {
      discardedWith = reason
    },
  }

  return {
    wire,
    get progressUpdates() {
      return progressUpdates
    },
    get failedWith() {
      return failedWith
    },
    get discardedWith() {
      return discardedWith
    },
  }
}
