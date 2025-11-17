import * as uWS from 'uWebSockets.js'

import { CoreSingletonServices, CreateInteractionServices } from '@pikku/core'
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
 * @property {CreateInteractionServices<any, any, any>} createInteractionServices - A function to create interaction services.
 * @property {boolean} [logRoutes] - Whether to log the routes.
 * @property {boolean} [loadSchemas] - Whether to load all schemas.
 * @property {RunHTTPWiringOptions} - Additional options for running the route.
 */
export type PikkuuWSHandlerOptions = {
  singletonServices: CoreSingletonServices
  createInteractionServices: CreateInteractionServices<any, any, any>
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
  createInteractionServices,
  loadSchemas,
}: PikkuuWSHandlerOptions) => {
  if (logRoutes) {
    logRegisterRoutes(singletonServices.logger)
  }
  if (loadSchemas) {
    compileAllSchemas(singletonServices.logger, singletonServices.schema)
  }

  return async (res: uWS.HttpResponse, req: uWS.HttpRequest): Promise<void> => {
    const request = await uwsToRequest(req, res)
    const response = await fetch(request, {
      singletonServices,
      createInteractionServices,
    })
    await sendPikkuResponseToUWS(response, res)
  }
}
