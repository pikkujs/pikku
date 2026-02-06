import { RequestHandler } from 'express'

import { CoreSingletonServices, CreateWireServices } from '@pikku/core'
import { fetch, RunHTTPWiringOptions } from '@pikku/core/http'
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
type PikkuMiddlewareArgs = RunHTTPWiringOptions & {
  logRoutes?: boolean
  loadSchemas?: boolean
  coerceDataFromSchema?: boolean
}

/**
 * Creates Express middleware for handling requests using the Pikku framework.
 *
 * @param {CoreSingletonServices} singletonServices - The singleton services used by the middleware.
 * @param {CreateWireServices<any, any, any>} createWireServices - A function to create wire services for each request.
 * @param {PikkuMiddlewareArgs} options - The configuration options for the middleware.
 * @returns {RequestHandler} - The Express middleware function.
 */
export const pikkuExpressMiddleware = (
  singletonServices: CoreSingletonServices,
  createWireServices: CreateWireServices<any, any, any> | undefined,
  {
    respondWith404,
    logRoutes,
    loadSchemas,
    coerceDataFromSchema,
  }: PikkuMiddlewareArgs = {}
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
      createWireServices,
      respondWith404,
      coerceDataFromSchema,
    })
    await sendResponseToExpress(res, response)
    next()
  }
}
