export abstract class EventHubStore {
  public abstract getChannelIdsForTopic(topic: string): Promise<string[]>
  public abstract subscribe(topic: string, channelId: string): Promise<boolean>
  public abstract unsubscribe(
    topic: string,
    channelId: string
  ): Promise<boolean>
}
