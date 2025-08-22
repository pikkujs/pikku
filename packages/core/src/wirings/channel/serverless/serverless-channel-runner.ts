import { SessionServices } from '../../../types/core.types.js'
import { closeSessionServices } from '../../../utils.js'
import { processMessageHandlers } from '../channel-handler.js'
import { openChannel } from '../channel-runner.js'
import type {
  CoreChannel,
  RunChannelOptions,
  RunChannelParams,
  PikkuChannelHandlerFactory,
} from '../channel.types.js'
import { createHTTPInteraction } from '../../http/http-runner.js'
import { ChannelStore } from '../channel-store.js'
import { handleHTTPError } from '../../../handle-error.js'
import { PikkuUserSessionService } from '../../../services/user-session-service.js'
import { combineMiddleware, runMiddleware } from '../../../middleware-runner.js'
import { pikkuState } from '../../../pikku-state.js'
import { PikkuFetchHTTPRequest } from '../../http/pikku-fetch-http-request.js'
import { PikkuHTTP } from '../../http/http.types.js'
import { runPikkuFuncDirectly } from '../../../function/function-runner.js'

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
  const channelConfig = channels[channelName]
  const channelsMeta = pikkuState('channel', 'meta')
  const meta = channelsMeta[channelName]
  if (!channelConfig) {
    throw new Error(`Channel not found: ${channelName}`)
  }
  if (!meta) {
    throw new Error(`Channel meta not found: ${channelName}`)
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
    meta,
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
  coerceDataFromSchema = true,
  logWarningsForStatusCodes = [],
  respondWith404 = true,
  bubbleErrors = false,
}: Pick<CoreChannel<unknown, any>, 'route'> &
  RunChannelOptions &
  RunServerlessChannelParams<unknown>) => {
  let sessionServices: SessionServices | undefined

  let http: PikkuHTTP | undefined
  if (request instanceof Request) {
    http = createHTTPInteraction(new PikkuFetchHTTPRequest(request), response)
  }

  const userSession = new PikkuUserSessionService(channelStore, channelId)

  const { channelConfig, openingData, meta } = await openChannel({
    channelId,
    createSessionServices,
    request,
    route,
    singletonServices,
    coerceDataFromSchema,
    userSession,
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
          await userSession.get()
        )
      }
      if (channelConfig.onConnect && meta.connect) {
        await runPikkuFuncDirectly(
          meta.connect.pikkuFuncName,
          { ...singletonServices, ...sessionServices, channel },
          openingData
        )
      }
      http?.response?.status(101)
    } catch (e: any) {
      handleHTTPError(
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
      userSession,
    },
    { http },
    combineMiddleware({
      wiringMiddleware: channelConfig.middleware,
      wiringTags: channelConfig.tags,
    }),
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
  const { channel, channelConfig, meta } = getVariablesForChannel({
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
  if (channelConfig.onDisconnect && meta.disconnect) {
    await runPikkuFuncDirectly(
      meta.disconnect.pikkuFuncName,
      { ...singletonServices, ...sessionServices, channel },
      undefined
    )
  }
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
      session,
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
