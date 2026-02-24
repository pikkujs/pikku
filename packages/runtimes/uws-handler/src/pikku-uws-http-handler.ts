import * as uWS from 'uWebSockets.js'

import type { Logger } from '@pikku/core/services'
import { fetch } from '@pikku/core/http'

import { uwsToRequest } from './uws-request-convertor.js'
import { sendPikkuResponseToUWS } from './uws-response-convertor.js'
import {
  logRoutes as logRegisterRoutes,
  RunHTTPWiringOptions,
} from '@pikku/core/http'
import { compileAllSchemas } from '@pikku/core/schema'

/**
 * Options for configuring the `pikkuHandler`.
 */
export type PikkuuWSHandlerOptions = {
  logger?: Logger
  logRoutes?: boolean
  loadSchemas?: boolean
} & RunHTTPWiringOptions

/**
 * Creates a uWebSockets handler for handling requests using the `@pikku/core` framework.
 *
 * @param options - The options to configure the handler.
 * @returns The request handler function.
 */
export const pikkuHTTPHandler = ({
  logRoutes,
  logger,
  loadSchemas,
}: PikkuuWSHandlerOptions) => {
  if (logRoutes && logger) {
    logRegisterRoutes(logger)
  }
  if (loadSchemas && logger) {
    compileAllSchemas(logger)
  }

  return (res: uWS.HttpResponse, req: uWS.HttpRequest): void => {
    let aborted = false

    const run = async () => {
      const request = await uwsToRequest(req, res, () => {
        aborted = true
      })
      const response = await fetch(request)
      if (!aborted) {
        await sendPikkuResponseToUWS(response, res, () => aborted)
      }
    }

    run().catch((err) => {
      logger?.error(`uWS HTTP error: ${err.message}`)
      if (!aborted) {
        try {
          res.cork(() => {
            res.writeStatus('500').end('Internal Server Error')
          })
        } catch {
          // response already sent or aborted
        }
      }
    })
  }
}
