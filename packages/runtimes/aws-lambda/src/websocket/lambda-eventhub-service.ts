import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi'
import {
  ChannelStore,
  EventHubService,
  EventHubStore,
} from '@pikku/core/channel'
import { getApiGatewayManagementApiClient, sendMessages } from './utils.js'
import { Logger } from '@pikku/core/services'
import { APIGatewayEvent } from 'aws-lambda'

export class LambdaEventHubService<EventTopics extends Record<string, any> = {}>
  implements EventHubService<EventTopics>
{
  private callbackAPI: ApiGatewayManagementApiClient

  constructor(
    private logger: Logger,
    event: APIGatewayEvent,
    private channelStore: ChannelStore,
    private eventHubStore: EventHubStore<EventTopics>
  ) {
    this.callbackAPI = getApiGatewayManagementApiClient(logger, event)
  }

  async subscribe<T extends keyof EventTopics>(
    topic: T,
    channelId: string
  ): Promise<void> {
    await this.eventHubStore.subscribe(topic, channelId)
  }

  async unsubscribe<T extends keyof EventTopics>(
    topic: T,
    channelId: string
  ): Promise<void> {
    await this.eventHubStore.unsubscribe(topic, channelId)
  }

  async publish<T extends keyof EventTopics>(
    topic: T,
    channelId: string | null,
    data: EventTopics[T],
    isBinary?: boolean
  ): Promise<void> {
    const channelIds = await this.eventHubStore.getChannelIdsForTopic(
      topic as string
    )
    if (channelId) {
      await this.sendMessages(channelIds, channelId, data, isBinary)
    }
  }

  private async sendMessages(
    channelIds: string[],
    fromChannelId: string,
    data: EventTopics[keyof EventTopics],
    isBinary?: boolean
  ): Promise<void> {
    await sendMessages(
      this.logger,
      this.channelStore,
      this.callbackAPI,
      fromChannelId,
      channelIds,
      data,
      isBinary
    )
  }
}
