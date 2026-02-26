import { RequestHandler } from 'express'

import type { Logger } from '@pikku/core/services'
import { fetch, RunHTTPWiringOptions } from '@pikku/core/http'
import { logRoutes as logRegisterRoutes } from '@pikku/core/http'
import { compileAllSchemas } from '@pikku/core/schema'
import { expressToRequest } from './express-request-convertor.js'
import { sendResponseToExpress } from './express-response-convertor.js'

/**
 * Arguments for configuring the Pikku middleware.
 */
type PikkuMiddlewareArgs = RunHTTPWiringOptions & {
  logger: Logger
  logRoutes?: boolean
  loadSchemas?: boolean
  coerceDataFromSchema?: boolean
}

/**
 * Creates Express middleware for handling requests using the Pikku framework.
 *
 * @param options - The configuration options for the middleware.
 * @returns The Express middleware function.
 */
export const pikkuExpressMiddleware = ({
  logger,
  respondWith404,
  logRoutes,
  loadSchemas,
  coerceDataFromSchema,
}: PikkuMiddlewareArgs): RequestHandler => {
  if (logRoutes) {
    logRegisterRoutes(logger)
  }
  if (loadSchemas) {
    compileAllSchemas(logger)
  }

  return async (req, res, next) => {
    const request = await expressToRequest(req)
    const response = await fetch(request, {
      respondWith404,
      coerceDataFromSchema,
    })
    await sendResponseToExpress(res, response)
    next()
  }
}
