export interface EventHubService<Topics extends Record<string, any>> {
  subscribe<T extends keyof Topics>(
    topic: T,
    channelId: string
  ): Promise<void> | void
  unsubscribe<T extends keyof Topics>(
    topic: T,
    channelId: string
  ): Promise<void> | void
  publish<T extends keyof Topics>(
    topic: T,
    channelId: string | null,
    data: Topics[T],
    isBinary?: boolean
  ): Promise<void> | void
}
