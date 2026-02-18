import { pikkuSessionlessFunc } from '../../.pikku/function/pikku-function-types.gen.js'

export const taskCreate = pikkuSessionlessFunc<
  { title: string; description?: string },
  {
    id: string
    title: string
    description?: string
    status: 'pending'
    processorVersion: string
  }
>({
  func: async (services, data) => {
    const processorVersion =
      (await services.variables.get('E2E_APP_VERSION')) || 'v1'

    return {
      id: `task-${Date.now()}`,
      title: data.title,
      description: data.description,
      status: 'pending',
      processorVersion,
    }
  },
})

export const taskUpdate = pikkuSessionlessFunc<
  { taskId: string; status: 'in_progress' | 'completed' },
  { id: string; status: 'in_progress' | 'completed' }
>({
  func: async (services, data) => {
    const delayMsRaw = await services.variables.get('E2E_TASK_UPDATE_DELAY_MS')
    const delayMs = delayMsRaw ? Number(delayMsRaw) : 0
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    return {
      id: data.taskId,
      status: data.status,
    }
  },
})

export const processItem = pikkuSessionlessFunc<
  { itemId: string; payload?: string },
  { version: number; result: string; itemId: string }
>({
  func: async (services, data) => {
    const appVersion = (await services.variables.get('E2E_APP_VERSION')) || 'v1'
    const version = appVersion === 'v2' ? 2 : 1
    return {
      version,
      result: `processed-v${version}`,
      itemId: data.itemId,
    }
  },
})
