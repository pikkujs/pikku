import { SessionServices } from '../../types/core.types.js'
import { closeSessionServices } from '../../utils.js'
import { processMessageHandlers } from '../channel-handler.js'
import { openChannel } from '../channel-runner.js'
import type {
  CoreAPIChannel,
  RunChannelOptions,
  RunChannelParams,
  PikkuChannelHandlerFactory,
} from '../channel.types.js'
import { createHTTPInteraction } from '../../http/http-route-runner.js'
import { ChannelStore } from '../channel-store.js'
import { handleError } from '../../handle-error.js'
import { RemoteUserSessionService } from '../../services/user-session-service.js'
import { runMiddleware } from '../../middleware-runner.js'
import { pikkuState } from '../../pikku-state.js'

export interface RunServerlessChannelParams<ChannelData>
  extends RunChannelParams<ChannelData> {
  channelStore: ChannelStore
  channelHandlerFactory: PikkuChannelHandlerFactory
  channelObject?: unknown
}

const getVariablesForChannel = ({
  channelId,
  channelName,
  channelHandlerFactory,
  openingData,
}: {
  channelId: string
  channelName: string
  channelHandlerFactory: PikkuChannelHandlerFactory
  openingData?: unknown
}) => {
  const channels = pikkuState('channel', 'channels')
  const channelConfig = channels.find(
    (channelConfig) => channelConfig.name === channelName
  )
  if (!channelConfig) {
    throw new Error(`Channel not found: ${channelName}`)
  }
  const channelHandler = channelHandlerFactory(
    channelId,
    channelConfig.name,
    openingData
  )
  return {
    channelConfig,
    channelHandler,
    channel: channelHandler.getChannel(),
  }
}

export const runChannelConnect = async ({
  singletonServices,
  channelId,
  channelObject,
  request,
  response,
  route,
  createSessionServices,
  channelStore,
  channelHandlerFactory,
  coerceToArray = false,
  logWarningsForStatusCodes = [],
  respondWith404 = true,
  bubbleErrors = false,
}: Pick<CoreAPIChannel<unknown, any>, 'route'> &
  RunChannelOptions &
  RunServerlessChannelParams<unknown>) => {
  let sessionServices: SessionServices | undefined
  const http = createHTTPInteraction(request, response)
  const userSessionService = new RemoteUserSessionService(
    channelStore,
    channelId
  )

  const { channelConfig, openingData } = await openChannel({
    channelId,
    createSessionServices,
    http,
    route,
    singletonServices,
    coerceToArray,
  })

  const main = async () => {
    try {
      await channelStore.addChannel({
        channelId,
        channelName: channelConfig.name,
        openingData,
        channelObject,
      })
      const { channel } = getVariablesForChannel({
        channelId,
        channelHandlerFactory,
        channelName: channelConfig.name,
      })
      if (createSessionServices) {
        sessionServices = await createSessionServices(
          singletonServices,
          { http },
          await userSessionService.get()
        )
      }
      await channelConfig.onConnect?.(
        { ...singletonServices, ...sessionServices },
        channel
      )
      http?.response?.setStatus(101)
    } catch (e: any) {
      handleError(
        e,
        http,
        channelId,
        singletonServices.logger,
        logWarningsForStatusCodes,
        respondWith404,
        bubbleErrors
      )
    } finally {
      if (sessionServices) {
        await closeSessionServices(singletonServices.logger, sessionServices)
      }
    }
  }

  await runMiddleware(
    {
      ...singletonServices,
      userSession: userSessionService,
    },
    { http },
    channelConfig.middleware || [],
    main
  )
}

export const runChannelDisconnect = async ({
  singletonServices,
  ...params
}: RunServerlessChannelParams<unknown>): Promise<void> => {
  let sessionServices: SessionServices | undefined
  const { openingData, channelName, session } =
    await params.channelStore.getChannelAndSession(params.channelId)
  const { channel, channelConfig } = getVariablesForChannel({
    ...params,
    openingData,
    channelName,
  })
  if (!sessionServices && params.createSessionServices) {
    sessionServices = await params.createSessionServices(
      singletonServices,
      {},
      session
    )
  }
  await channelConfig.onDisconnect?.(
    { ...singletonServices, ...sessionServices },
    channel
  )
  await params.channelStore.removeChannels([channel.channelId])
  if (sessionServices) {
    await closeSessionServices(singletonServices.logger, sessionServices)
  }
}

export const runChannelMessage = async (
  { singletonServices, ...params }: RunServerlessChannelParams<unknown>,
  data: unknown
): Promise<unknown> => {
  let sessionServices: SessionServices | undefined
  const { openingData, channelName, session } =
    await params.channelStore.getChannelAndSession(params.channelId)
  const { channelHandler, channelConfig } = getVariablesForChannel({
    ...params,
    openingData,
    channelName,
  })
  if (params.createSessionServices) {
    sessionServices = await params.createSessionServices(
      singletonServices,
      {},
      session
    )
  }
  let response: unknown
  try {
    const onMessage = processMessageHandlers(
      { ...singletonServices, ...sessionServices },
      channelConfig,
      channelHandler
    )
    response = await onMessage(data)
  } finally {
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
  return response
}
