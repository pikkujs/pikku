import { openChannel } from '../channel-runner.js'
import { createHTTPInteraction } from '../../http/http-runner.js'
import { closeSessionServices } from '../../utils.js'
import { processMessageHandlers } from '../channel-handler.js'
import {
  CoreAPIChannel,
  RunChannelOptions,
  RunChannelParams,
} from '../channel.types.js'
import { PikkuLocalChannelHandler } from './local-channel-handler.js'
import { SessionServices } from '../../types/core.types.js'
import { handleError } from '../../handle-error.js'
import { runMiddleware } from '../../middleware-runner.js'
import { PikkuUserSessionService } from '../../services/user-session-service.js'
import { PikkuHTTP } from '../../http/http.types.js'
import { runPikkuFuncDirectly } from '../../function/function-runner.js'
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
}: Partial<Pick<CoreAPIChannel<unknown, any>, 'route'>> &
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

  const main = async () => {
    try {
      const { openingData, channelConfig, meta } = await openChannel({
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
      })

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
          { http },
          session
        )
      }

      const allServices = rpcService.injectRPCService({
        ...singletonServices,
        ...sessionServices,
        userSession: userSession,
      })

      channelHandler.registerOnOpen(() => {
        if (channelConfig.onConnect && meta.connectPikkuFuncName) {
          runPikkuFuncDirectly(
            meta.connectPikkuFuncName,
            { ...allServices, channel },
            openingData
          )
        }
      })

      channelHandler.registerOnClose(async () => {
        if (channelConfig.onDisconnect && meta.disconnectPikkuFuncName) {
          runPikkuFuncDirectly(
            meta.disconnectPikkuFuncName,
            { ...allServices, channel },
            openingData
          )
        }
        if (sessionServices) {
          await closeSessionServices(singletonServices.logger, sessionServices)
        }
      })

      channelHandler.registerOnMessage(
        processMessageHandlers(
          allServices,
          session,
          channelConfig as any,
          channelHandler
        )
      )
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
      userSession,
    },
    { http },
    route.middleware || [],
    main
  )

  return channelHandler
}
