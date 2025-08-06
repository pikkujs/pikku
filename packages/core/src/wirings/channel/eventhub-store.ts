export abstract class EventHubStore<
  EventTopics extends Record<string, any> = {},
> {
  public abstract getChannelIdsForTopic(topic: string): Promise<string[]>
  public abstract subscribe<T extends keyof EventTopics>(
    topic: T,
    channelId: string
  ): Promise<boolean>
  public abstract unsubscribe<T extends keyof EventTopics>(
    topic: T,
    channelId: string
  ): Promise<boolean>
}
