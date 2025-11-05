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

import {
  Config,
  SingletonServices,
} from '../../functions/types/application-types.d.js'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'
import { PgChannelStore, PgEventHubStore } from '@pikku/pg'
import postgres from 'postgres'

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
    // Configure PostgreSQL connection from DATABASE_URL environment variable
    const databaseUrl =
      (await variables.get('DATABASE_URL')) ||
      'postgresql://localhost:5432/pikku'
    const dbSchema = (await variables.get('DB_SCHEMA')) || 'pikku'

    const sql = postgres(databaseUrl)
    const channelStore = new PgChannelStore(sql, dbSchema)
    const eventHubStore = new PgEventHubStore(sql, dbSchema)

    // Initialize stores (creates schema and tables if needed)
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
