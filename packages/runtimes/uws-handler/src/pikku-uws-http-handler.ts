import * as uWS from 'uWebSockets.js'

import { CoreSingletonServices, CreateSessionServices } from '@pikku/core'
import { runHTTPRoute } from '@pikku/core/http'

import { PikkuUWSRequest } from './pikku-uws-request.js'
import { PikkuUWSResponse } from './pikku-uws-response.js'
import {
  logRoutes as logRegisterRoutes,
  RunRouteOptions,
} from '@pikku/core/http'
import { compileAllSchemas } from '@pikku/core/schema'

/**
 * Options for configuring the `pikkuHandler`.
 *
 * @typedef {Object} PikkuuWSHandlerOptions
 * @property {CoreSingletonServices} singletonServices - The singleton services used by the handler.
 * @property {CreateSessionServices<any, any, any>} createSessionServices - A function to create session services.
 * @property {boolean} [logRoutes] - Whether to log the routes.
 * @property {boolean} [loadSchemas] - Whether to load all schemas.
 * @property {RunRouteOptions} - Additional options for running the route.
 */
export type PikkuuWSHandlerOptions = {
  singletonServices: CoreSingletonServices
  createSessionServices: CreateSessionServices<any, any, any>
  logRoutes?: boolean
  loadSchemas?: boolean
} & RunRouteOptions

/**
 * Creates a uWebSockets handler for handling requests using the `@pikku/core` framework.
 *
 * @param {PikkuuWSHandlerOptions} options - The options to configure the handler.
 * @returns {Function} - The request handler function.
 */
export const pikkuHTTPHandler = ({
  logRoutes,
  singletonServices,
  createSessionServices,
  loadSchemas,
}: PikkuuWSHandlerOptions) => {
  if (logRoutes) {
    logRegisterRoutes(singletonServices.logger)
  }
  if (loadSchemas) {
    compileAllSchemas(singletonServices.logger, singletonServices.schemaService)
  }

  return async (res: uWS.HttpResponse, req: uWS.HttpRequest): Promise<void> => {
    await runHTTPRoute({
      request: new PikkuUWSRequest(req, res),
      response: new PikkuUWSResponse(res),
      singletonServices,
      createSessionServices,
      method: req.getMethod() as any,
      route: req.getUrl() as string,
    })
  }
}
