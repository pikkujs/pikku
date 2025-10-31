import { openChannel } from '../channel-runner.js'
import { createHTTPInteraction } from '../../http/http-runner.js'
import { closeSessionServices } from '../../../utils.js'
import { processMessageHandlers } from '../channel-handler.js'
import {
  CoreChannel,
  RunChannelOptions,
  RunChannelParams,
} from '../channel.types.js'
import { PikkuLocalChannelHandler } from './local-channel-handler.js'
import {
  PikkuInteraction,
  PikkuWiringTypes,
  SessionServices,
} from '../../../types/core.types.js'
import { handleHTTPError } from '../../../handle-error.js'
import { combineMiddleware, runMiddleware } from '../../../middleware-runner.js'
import { PikkuUserSessionService } from '../../../services/user-session-service.js'
import { PikkuHTTP } from '../../http/http.types.js'
import { runPikkuFuncDirectly } from '../../../function/function-runner.js'
import { rpcService } from '../../rpc/rpc-runner.js'

export const runLocalChannel = async ({
  singletonServices,
  channelId,
  request,
  response,
  route,
  createSessionServices,
  skipUserSession = false,
  respondWith404 = true,
  coerceDataFromSchema = true,
  logWarningsForStatusCodes = [],
  bubbleErrors = false,
}: Partial<Pick<CoreChannel<unknown, any>, 'route'>> &
  RunChannelOptions &
  RunChannelParams<unknown>): Promise<PikkuLocalChannelHandler | void> => {
  let sessionServices: SessionServices<typeof singletonServices> | undefined

  let channelHandler: PikkuLocalChannelHandler | undefined
  const userSession = new PikkuUserSessionService()

  let http: PikkuHTTP | undefined
  if (request) {
    http = createHTTPInteraction(request, response)
    route = http?.request?.path()
  }

  let openingData, channelConfig, meta
  try {
    ;({ openingData, channelConfig, meta } = await openChannel({
      channelId,
      createSessionServices,
      respondWith404,
      request,
      response,
      route,
      singletonServices,
      skipUserSession,
      coerceDataFromSchema,
      userSession,
    }))
  } catch (e) {
    handleHTTPError(
      e,
      http,
      channelId,
      singletonServices.logger,
      logWarningsForStatusCodes,
      respondWith404,
      bubbleErrors
    )
    return
  }

  const main = async () => {
    try {
      channelHandler = new PikkuLocalChannelHandler(
        channelId,
        channelConfig.name,
        openingData
      )
      const channel = channelHandler.getChannel()
      const session = await userSession.get()
      if (createSessionServices) {
        sessionServices = await createSessionServices(
          singletonServices,
          { http, channel },
          session
        )
      }

      const getAllServices = (channel: any, requiresAuth?: boolean) =>
        rpcService.injectRPCService(
          {
            ...singletonServices,
            ...sessionServices,
            channel,
            userSession,
          },
          interaction,
          requiresAuth
        )

      const interaction: PikkuInteraction = { channel }

      channelHandler.registerOnOpen(async () => {
        if (channelConfig.onConnect && meta.connect) {
          try {
            const result = await runPikkuFuncDirectly(
              meta.connect.pikkuFuncName,
              getAllServices(channel, false),
              openingData
            )
            await channel.send(result)
          } catch (e) {
            singletonServices.logger.error(`Error handling onConnect: ${e}`)
            channel.send({ error: e.message || 'Unknown error' })
          }
        }
      })

      channelHandler.registerOnClose(async () => {
        if (channelConfig.onDisconnect && meta.disconnect) {
          try {
            await runPikkuFuncDirectly(
              meta.disconnect.pikkuFuncName,
              getAllServices(channel, false),
              openingData
            )
          } catch (e) {
            singletonServices.logger.error(`Error handling onDisconnect: ${e}`)
            channel.send({ error: e.message || 'Unknown error' })
          }
        }

        if (sessionServices) {
          await closeSessionServices(singletonServices.logger, sessionServices)
        }
      })

      const onMessage = processMessageHandlers(
        getAllServices(channel),
        channelConfig as any,
        channelHandler
      )
      channelHandler.registerOnMessage(async (data) => {
        try {
          const result = await onMessage(data)
          await channel.send(result)
        } catch (e) {
          singletonServices.logger.error(`Error handling message: ${e.message}`)
          channel.send({ error: e.message || 'Unknown error' })
        }
      })
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
    combineMiddleware(PikkuWiringTypes.channel, channelConfig.name, {
      wireInheritedMiddleware: meta.middleware,
      wireMiddleware: channelConfig.middleware,
    }),
    main
  )

  return channelHandler
}
