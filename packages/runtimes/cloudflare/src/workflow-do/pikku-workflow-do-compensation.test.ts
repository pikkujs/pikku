import { getSingletonServices } from '@pikku/core/state'
import { DEFAULT_STEP_RETRIES } from '@pikku/core/workflow'
import { defineServiceTests } from '@pikku/core/testing'

import { PikkuWorkflowDoService } from './pikku-workflow-do-service.js'
import type {
  PikkuStepStub,
  PikkuWorkflowDoEnv,
} from './pikku-workflow-do-service.js'

class FakeStorage {
  data = new Map<string, unknown>()

  constructor(private readonly onAlarm: () => void) {}

  async get(key: string | string[]): Promise<any> {
    if (Array.isArray(key)) {
      const out = new Map<string, unknown>()
      for (const k of key) {
        if (this.data.has(k)) out.set(k, structuredClone(this.data.get(k)))
      }
      return out
    }
    const value = this.data.get(key)
    return value === undefined ? undefined : structuredClone(value)
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value))
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async setAlarm(): Promise<void> {
    this.onAlarm()
  }
}

class QueuedDoService extends PikkuWorkflowDoService<PikkuWorkflowDoEnv> {
  protected override async getStepStub(): Promise<PikkuStepStub | null> {
    return {
      run: async (dispatch) => {
        await getSingletonServices().queueService!.add('step', dispatch, {
          attempts: (dispatch.retries ?? DEFAULT_STEP_RETRIES) + 1,
        })
      },
    }
  }
}

const RUN_ID = 'do-run'

defineServiceTests({
  name: 'cloudflare-durable-object',
  services: {
    workflowCompensationQueued: async () => {
      const storage = new FakeStorage(() => {
        void getSingletonServices().queueService!.add('orchestrator', {
          runId: RUN_ID,
        })
      })
      return new QueuedDoService(storage as never, {}, RUN_ID)
    },
    workflowCompensationQueuedOptions: { childWorkflows: false },
  },
})
