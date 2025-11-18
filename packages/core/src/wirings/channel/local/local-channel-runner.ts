import { openChannel } from '../channel-runner.js'
import { createHTTPWire } from '../../http/http-runner.js'
import { closeWireServices } from '../../../utils.js'
import { processMessageHandlers } from '../channel-handler.js'
import {
  CoreChannel,
  RunChannelOptions,
  RunChannelParams,
} from '../channel.types.js'
import { PikkuLocalChannelHandler } from './local-channel-handler.js'
import { PikkuWire, WireServices } from '../../../types/core.types.js'
import { handleHTTPError } from '../../../handle-error.js'
import { PikkuSessionService } from '../../../services/user-session-service.js'
import { PikkuHTTP } from '../../http/http.types.js'
import { runChannelLifecycleWithMiddleware } from '../channel-common.js'

export const runLocalChannel = async ({
  singletonServices,
  channelId,
  request,
  response,
  route,
  createWireServices,
  skipUserSession = false,
  respondWith404 = true,
  coerceDataFromSchema = true,
  logWarningsForStatusCodes = [],
  bubbleErrors = false,
}: Partial<Pick<CoreChannel<unknown, any>, 'route'>> &
  RunChannelOptions &
  RunChannelParams<unknown>): Promise<PikkuLocalChannelHandler | void> => {
  let wireServices: WireServices<typeof singletonServices> | undefined

  let channelHandler: PikkuLocalChannelHandler | undefined
  const userSession = new PikkuSessionService()

  let http: PikkuHTTP | undefined
  if (request) {
    http = createHTTPWire(request, response)
    route = http?.request?.path()
  }

  let openingData, channelConfig, meta
  try {
    ;({ openingData, channelConfig, meta } = await openChannel({
      channelId,
      createWireServices,
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
      const wire: PikkuWire = { channel, session: userSession }

      if (createWireServices) {
        wireServices = await createWireServices(singletonServices, wire)
      }

      const services = { ...singletonServices, ...wireServices }

      channelHandler.registerOnOpen(async () => {
        if (channelConfig.onConnect && meta.connect) {
          try {
            const result = await runChannelLifecycleWithMiddleware({
              channelConfig,
              meta: meta.connect,
              lifecycleConfig: channelConfig.onConnect,
              lifecycleType: 'connect',
              services,
              channel,
              data: openingData,
            })
            if (result !== undefined) {
              await channel.send(result)
            }
          } catch (e) {
            singletonServices.logger.error(`Error handling onConnect: ${e}`)
            channel.send({ error: e.message || 'Unknown error' })
          }
        }
      })

      channelHandler.registerOnClose(async () => {
        if (channelConfig.onDisconnect && meta.disconnect) {
          try {
            await runChannelLifecycleWithMiddleware({
              channelConfig,
              meta: meta.disconnect,
              lifecycleConfig: channelConfig.onDisconnect,
              lifecycleType: 'disconnect',
              services,
              channel,
            })
          } catch (e) {
            singletonServices.logger.error(`Error handling onDisconnect: ${e}`)
            channel.send({ error: e.message || 'Unknown error' })
          }
        }

        if (wireServices) {
          await closeWireServices(singletonServices.logger, wireServices)
        }
      })

      const onMessage = processMessageHandlers(
        services,
        channelConfig as any,
        channelHandler,
        userSession
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
      if (wireServices) {
        await closeWireServices(singletonServices.logger, wireServices)
      }
    }
  }

  await main()

  return channelHandler
}
