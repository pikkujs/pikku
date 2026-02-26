import { PikkuWire, WireServices } from '../../../types/core.types.js'
import { closeWireServices } from '../../../utils.js'
import { processMessageHandlers } from '../channel-handler.js'
import { openChannel } from '../channel-runner.js'
import type {
  CoreChannel,
  RunChannelOptions,
  RunChannelParams,
  PikkuChannelHandlerFactory,
} from '../channel.types.js'
import { createHTTPWire } from '../../http/http-runner.js'
import { ChannelStore } from '../channel-store.js'
import { handleHTTPError } from '../../../handle-error.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../../services/user-session-service.js'
import {
  getSingletonServices,
  getCreateWireServices,
  pikkuState,
} from '../../../pikku-state.js'
import { PikkuFetchHTTPRequest } from '../../http/pikku-fetch-http-request.js'
import { PikkuHTTP } from '../../http/http.types.js'
import { runChannelLifecycleWithMiddleware } from '../channel-common.js'

export interface RunServerlessChannelParams<ChannelData>
  extends Omit<
    RunChannelParams<ChannelData>,
    'singletonServices' | 'createWireServices'
  > {
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
  const channels = pikkuState(null, 'channel', 'channels')
  const channelConfig = channels.get(channelName)
  const channelsMeta = pikkuState(null, 'channel', 'meta')
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
  channelId,
  channelObject,
  request,
  response,
  route,
  channelStore,
  channelHandlerFactory,
  coerceDataFromSchema = true,
  logWarningsForStatusCodes = [],
  respondWith404 = true,
  bubbleErrors = false,
}: Pick<CoreChannel<unknown, any>, 'route'> &
  RunChannelOptions &
  RunServerlessChannelParams<unknown>) => {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
  let wireServices: WireServices | undefined

  let http: PikkuHTTP | undefined
  if (request instanceof Request) {
    http = createHTTPWire(new PikkuFetchHTTPRequest(request), response)
  }

  const userSession = new PikkuSessionService(channelStore, channelId)

  const { channelConfig, openingData, meta } = await openChannel({
    channelId,
    createWireServices,
    request,
    route,
    singletonServices,
    coerceDataFromSchema,
    userSession,
  })

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

    const wire: PikkuWire = {
      channel,
      ...createMiddlewareSessionWireProps(userSession),
    }

    if (createWireServices) {
      wireServices = await createWireServices(singletonServices, wire)
    }

    const services = {
      ...singletonServices,
      ...wireServices,
    }

    if (channelConfig.onConnect && meta.connect) {
      await runChannelLifecycleWithMiddleware({
        channelConfig,
        meta: meta.connect,
        lifecycleConfig: channelConfig.onConnect,
        lifecycleType: 'connect',
        services,
        channel,
        data: openingData,
        channelMiddlewareMeta: meta.channelMiddleware,
      })
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
    if (wireServices) {
      await closeWireServices(singletonServices.logger, wireServices)
    }
  }
}

export const runChannelDisconnect = async ({
  channelId,
  channelStore,
  channelHandlerFactory,
}: RunServerlessChannelParams<unknown>): Promise<void> => {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
  let wireServices: WireServices | undefined

  // Try to get channel from store. In serverless environments (especially with
  // serverless-offline or worker threads), disconnect can be called multiple times
  // or after the channel has already been cleaned up. If channel doesn't exist,
  // there's nothing to disconnect, so we can return early.
  let channelData
  try {
    channelData = await channelStore.getChannelAndSession(channelId)
  } catch (error) {
    singletonServices.logger.info(
      `Channel ${channelId} not found during disconnect - already cleaned up`
    )
    return
  }

  const { openingData, channelName, session } = channelData
  const { channel, channelConfig, meta } = getVariablesForChannel({
    channelId,
    channelHandlerFactory,
    openingData,
    channelName,
  })

  const userSession = new PikkuSessionService(channelStore, channelId)
  userSession.setInitial(session)
  const wire: PikkuWire = {
    channel,
    ...createMiddlewareSessionWireProps(userSession),
  }

  if (createWireServices) {
    wireServices = await createWireServices(singletonServices, wire)
  }

  const services = {
    ...singletonServices,
    ...wireServices,
  }

  if (channelConfig.onDisconnect && meta.disconnect) {
    try {
      await runChannelLifecycleWithMiddleware({
        channelConfig,
        meta: meta.disconnect,
        lifecycleConfig: channelConfig.onDisconnect,
        lifecycleType: 'disconnect',
        services,
        channel,
        channelMiddlewareMeta: meta.channelMiddleware,
      })
    } catch (e: any) {
      singletonServices.logger.error(
        `Error handling onDisconnect: ${e.message || e}`
      )
    }
  }
  await channelStore.removeChannels([channel.channelId])
  if (wireServices) {
    await closeWireServices(singletonServices.logger, wireServices)
  }
}

export const runChannelMessage = async (
  {
    channelId,
    channelStore,
    channelHandlerFactory,
  }: RunServerlessChannelParams<unknown>,
  data: unknown
): Promise<unknown> => {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
  let wireServices: WireServices | undefined
  const { openingData, channelName, session } =
    await channelStore.getChannelAndSession(channelId)

  const { channel, channelHandler, channelConfig } = getVariablesForChannel({
    channelId,
    channelHandlerFactory,
    openingData,
    channelName,
  })

  const userSession = new PikkuSessionService(channelStore, channelId)
  userSession.setInitial(session)
  const wire: PikkuWire = {
    channel,
    ...createMiddlewareSessionWireProps(userSession),
  }

  if (createWireServices) {
    wireServices = await createWireServices(singletonServices, wire)
  }

  const services = {
    ...singletonServices,
    ...wireServices,
  }

  let response: unknown
  try {
    const onMessage = processMessageHandlers(
      services,
      channelConfig,
      channelHandler,
      userSession
    )
    response = await onMessage(data)
  } catch (e: any) {
    singletonServices.logger.error(
      `Error processing message: ${e.message || e}`
    )
    return { error: e.message || 'Unknown error' }
  } finally {
    if (wireServices) {
      await closeWireServices(singletonServices.logger, wireServices)
    }
  }
  return response
}
