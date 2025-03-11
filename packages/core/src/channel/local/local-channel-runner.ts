import { openChannel } from '../channel-runner.js'
import { createHTTPInteraction } from '../../http/http-route-runner.js'
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
import { LocalUserSessionService } from '../../services/user-session-service.js'

export const runLocalChannel = async ({
  singletonServices,
  channelId,
  request,
  response,
  route,
  createSessionServices,
  skipUserSession = false,
  respondWith404 = true,
  coerceToArray = false,
  logWarningsForStatusCodes = [],
  bubbleErrors = false,
}: Pick<CoreAPIChannel<unknown, any>, 'route'> &
  RunChannelOptions &
  RunChannelParams<unknown>): Promise<PikkuLocalChannelHandler | void> => {
  let sessionServices: SessionServices<typeof singletonServices> | undefined

  let channelHandler: PikkuLocalChannelHandler | undefined
  const userSessionService = new LocalUserSessionService()
  const http = createHTTPInteraction(request, response)

  const main = async () => {
    try {
      const { openingData, channelConfig } = await openChannel({
        channelId,
        createSessionServices,
        respondWith404,
        http,
        route,
        singletonServices,
        skipUserSession,
        coerceToArray,
      })

      channelHandler = new PikkuLocalChannelHandler(
        channelId,
        channelConfig.name,
        openingData
      )
      const channel = channelHandler.getChannel()
      const userSession = await userSessionService.get()
      if (createSessionServices) {
        sessionServices = await createSessionServices(
          singletonServices,
          { http },
          userSession
        )
      }
      const allServices = {
        ...singletonServices,
        ...sessionServices,
        userSession: userSessionService,
      }

      channelHandler.registerOnOpen(() => {
        channelConfig.onConnect?.(allServices, channel)
      })

      channelHandler.registerOnClose(async () => {
        channelConfig.onDisconnect?.(allServices, channel)
        if (sessionServices) {
          await closeSessionServices(singletonServices.logger, sessionServices)
        }
      })

      channelHandler.registerOnMessage(
        processMessageHandlers(allServices, channelConfig, channelHandler)
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
      userSession: userSessionService,
    },
    { http },
    route.middleware || [],
    main
  )

  return channelHandler!
}
