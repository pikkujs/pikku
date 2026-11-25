export interface SingletonServices {
  cache: number
  queueService?: number
}

declare const pikkuServices: <T>(factory: T) => T
declare const pikkuWireServices: <T>(factory: T) => T
declare const audit: boolean

// The keys the project's factories return, and which of them may be absent.
export const createSingletonServices = pikkuServices(
  async (_config: unknown, existing: Record<string, unknown>) => ({
    cache: 1,
    existing,
    ...(audit ? { queueService: 2 } : {}),
  })
)
export const createWireServices = pikkuWireServices(async () => ({
  requestId: 'r',
}))
