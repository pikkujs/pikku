import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi'
import type { ChannelStore, EventHubService } from '@pikku/core/channel'
import type { EventHubStore } from '@pikku/core/channel'
import { getApiGatewayManagementApiClient, sendMessages } from './utils.js'
import type { Logger } from '@pikku/core/services'
import type { APIGatewayEvent } from 'aws-lambda'

export class LambdaEventHubService<
  EventTopics extends Record<string, any> = {},
> implements EventHubService<EventTopics> {
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

  /**
   * API GATEWAY WEBSOCKETS ONLY. Every publish is a `PostToConnection` call
   * against a connection id, and a Lambda invocation cannot hold an open stream
   * from some other invocation in memory, so there is nothing an SSE handler
   * could be registered on. Refusing is the honest answer.
   */
  async onChannelOpened(): Promise<void> {
    throw new Error(
      'LambdaEventHubService delivers to API Gateway WebSocket connections only, so it cannot serve SSE.'
    )
  }

  /**
   * Subscriptions live in the `eventHubStore`, and the `$disconnect` route is
   * what clears them — there is no per-invocation state to drop here.
   */
  async onChannelClosed(): Promise<void> {}

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
