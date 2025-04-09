import { RequestHandler } from 'express'

import { CoreSingletonServices, CreateSessionServices } from '@pikku/core'
import { fetch, RunRouteOptions } from '@pikku/core/http'
import { logRoutes as logRegisterRoutes } from '@pikku/core/http'
import { compileAllSchemas } from '@pikku/core/schema'
import { expressToRequest } from './express-request-convertor.js'
import { sendResponseToExpress } from './express-response-convertor.js'

/**
 * Arguments for configuring the Pikku middleware.
 *
 * @typedef {Object} PikkuMiddlewareArgs
 * @property {boolean} [skipUserSession] - Whether to skip user session creation for this route.
 * @property {boolean} [respondWith404] - Whether to respond with a 404 status if the route is not found.
 * @property {boolean} [logRoutes] - Whether to log the routes.
 * @property {boolean} [loadSchemas] - Whether to load all schemas.
 */
type PikkuMiddlewareArgs = RunRouteOptions & {
  logRoutes?: boolean
  loadSchemas?: boolean
  coerceToArray?: boolean
}

/**
 * Creates Express middleware for handling requests using the Pikku framework.
 *
 * @param {CoreSingletonServices} singletonServices - The singleton services used by the middleware.
 * @param {CreateSessionServices<any, any, any>} createSessionServices - A function to create session services for each request.
 * @param {PikkuMiddlewareArgs} options - The configuration options for the middleware.
 * @returns {RequestHandler} - The Express middleware function.
 */
export const pikkuExpressMiddleware = (
  singletonServices: CoreSingletonServices,
  createSessionServices: CreateSessionServices<any, any, any>,
  { respondWith404, logRoutes, loadSchemas, coerceToArray }: PikkuMiddlewareArgs
): RequestHandler => {
  if (logRoutes) {
    logRegisterRoutes(singletonServices.logger)
  }
  if (loadSchemas) {
    compileAllSchemas(singletonServices.logger, singletonServices.schema)
  }

  return async (req, res, next) => {
    const request = await expressToRequest(req)
    const response = await fetch(request, {
      singletonServices,
      createSessionServices,
      respondWith404,
      coerceToArray,
    })
    await sendResponseToExpress(res, response)
    next()
  }
}
