import { APIGatewayEvent, APIGatewayProxyHandler } from 'aws-lambda'

import {
  connectWebsocket,
  disconnectWebsocket,
  LambdaEventHubService,
  processWebsocketMessage,
} from '@pikku/lambda/websocket'

import { AWSSecrets } from '@pikku/aws-services'
import { ChannelStore } from '@pikku/core/channel'
import { MakeRequired } from '@pikku/core'
import { LocalVariablesService } from '@pikku/core/services'

import { KyselyChannelStore, KyselyEventHubStore } from '@pikku/kysely'
import {
  Config,
  SingletonServices,
} from '../../functions/types/application-types.d.js'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'

let state:
  | {
      config: Config
      singletonServices: SingletonServices
      channelStore: ChannelStore
    }
  | undefined

const getParams = async (event: APIGatewayEvent) => {
  if (!state) {
    const config = await createConfig()
    const variables = new LocalVariablesService()
    const singletonServices = await createSingletonServices(config, {
      variables,
      // @ts-ignore TODO
      secrets: new AWSSecrets(config),
    })
    // @ts-ignore
    const channelStore = new KyselyChannelStore(singletonServices.kysely)
    // @ts-ignore
    const eventHubStore = new KyselyEventHubStore(singletonServices.kysely)
    singletonServices.eventHub = new LambdaEventHubService(
      singletonServices.logger,
      event,
      channelStore,
      eventHubStore
    )
    state = {
      config,
      singletonServices: singletonServices as MakeRequired<
        typeof singletonServices,
        'eventHub'
      >,
      channelStore,
    }
  }
  return state
}

export const connectHandler: APIGatewayProxyHandler = async (event) => {
  const params = await getParams(event)
  await connectWebsocket(event, params)
  return { statusCode: 200, body: '' }
}

export const disconnectHandler: APIGatewayProxyHandler = async (event) => {
  const params = await getParams(event)
  return await disconnectWebsocket(event, params)
}

export const defaultHandler: APIGatewayProxyHandler = async (event) => {
  const params = await getParams(event)
  return await processWebsocketMessage(event, params)
}
