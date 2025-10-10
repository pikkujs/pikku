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

  let openingData, channelConfig, meta, httpMiddleware
  try {
    ;({ openingData, channelConfig, meta, httpMiddleware } = await openChannel({
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

      const interaction: PikkuInteraction = { channel }

      channelHandler.registerOnOpen(() => {
        const allServices = rpcService.injectRPCService(
          {
            ...singletonServices,
            ...sessionServices,
            userSession,
          },
          interaction,
          false
        )

        if (channelConfig.onConnect && meta.connect) {
          runPikkuFuncDirectly(
            meta.connect.pikkuFuncName,
            { ...allServices, channel },
            openingData
          )
        }
      })

      channelHandler.registerOnClose(async () => {
        const allServices = rpcService.injectRPCService(
          {
            ...singletonServices,
            ...sessionServices,
            userSession,
          },
          interaction,
          false
        )

        if (channelConfig.onDisconnect && meta.disconnect) {
          runPikkuFuncDirectly(
            meta.disconnect.pikkuFuncName,
            { ...allServices, channel },
            openingData
          )
        }

        if (sessionServices) {
          await closeSessionServices(singletonServices.logger, sessionServices)
        }
      })

      const allServices = rpcService.injectRPCService(
        {
          ...singletonServices,
          ...sessionServices,
          userSession,
        },
        interaction
      )

      channelHandler.registerOnMessage(
        processMessageHandlers(
          allServices,
          channelConfig as any,
          channelHandler
        )
      )
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
      wiringMiddleware: channelConfig.middleware,
      wiringTags: channelConfig.tags,
      httpMiddleware,
    }),
    main
  )

  return channelHandler
}
