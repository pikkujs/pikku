import * as uWS from 'uWebSockets.js'

import { CoreSingletonServices, CreateWireServices } from '@pikku/core'
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
 *
 * @typedef {Object} PikkuuWSHandlerOptions
 * @property {CoreSingletonServices} singletonServices - The singleton services used by the handler.
 * @property {CreateWireServices<any, any, any>} createWireServices - A function to create wire services.
 * @property {boolean} [logRoutes] - Whether to log the routes.
 * @property {boolean} [loadSchemas] - Whether to load all schemas.
 * @property {RunHTTPWiringOptions} - Additional options for running the route.
 */
export type PikkuuWSHandlerOptions = {
  singletonServices: CoreSingletonServices
  createWireServices?: CreateWireServices<any, any, any>
  logRoutes?: boolean
  loadSchemas?: boolean
} & RunHTTPWiringOptions

/**
 * Creates a uWebSockets handler for handling requests using the `@pikku/core` framework.
 *
 * @param {PikkuuWSHandlerOptions} options - The options to configure the handler.
 * @returns {Function} - The request handler function.
 */
export const pikkuHTTPHandler = ({
  logRoutes,
  singletonServices,
  createWireServices,
  loadSchemas,
}: PikkuuWSHandlerOptions) => {
  if (logRoutes) {
    logRegisterRoutes(singletonServices.logger)
  }
  if (loadSchemas) {
    compileAllSchemas(singletonServices.logger, singletonServices.schema)
  }

  return (res: uWS.HttpResponse, req: uWS.HttpRequest): void => {
    let aborted = false
    res.onAborted(() => {
      aborted = true
    })

    const run = async () => {
      const request = await uwsToRequest(req, res)
      const response = await fetch(request, {
        singletonServices,
        createWireServices,
      })
      if (!aborted) {
        await sendPikkuResponseToUWS(response, res, () => aborted)
      }
    }

    run().catch((err) => {
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
