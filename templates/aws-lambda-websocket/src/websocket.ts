import '../../functions/.pikku/pikku-bootstrap.gen.js'
import { APIGatewayEvent, APIGatewayProxyHandler } from 'aws-lambda'

import {
  connectWebsocket,
  disconnectWebsocket,
  LambdaEventHubService,
  processWebsocketMessage,
} from '@pikku/lambda/websocket'

import { ChannelStore } from '@pikku/core/channel'
import { LocalVariablesService } from '@pikku/core/services'
import { PgChannelStore, PgEventHubStore } from '@pikku/pg'
import postgres from 'postgres'

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
    })
    // Connect to PostgreSQL (use environment variable for connection string)
    // For AWS Lambda, this should connect to RDS or Aurora Serverless
    const sql = postgres(process.env.DATABASE_URL || '')
    const channelStore = new PgChannelStore(sql)
    const eventHubStore = new PgEventHubStore(sql)
    await channelStore.init()
    await eventHubStore.init()
    singletonServices.eventHub = new LambdaEventHubService(
      singletonServices.logger,
      event,
      channelStore,
      eventHubStore
    )
    state = {
      config,
      singletonServices,
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
