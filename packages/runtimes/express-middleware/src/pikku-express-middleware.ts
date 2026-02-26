import { RequestHandler } from 'express'

import type { Logger } from '@pikku/core/services'
import { fetchData, RunHTTPWiringOptions } from '@pikku/core/http'
import { logRoutes as logRegisterRoutes } from '@pikku/core/http'
import { compileAllSchemas } from '@pikku/core/schema'
import { ExpressPikkuHTTPRequest } from './express-pikku-http-request.js'
import { ExpressPikkuHTTPResponse } from './express-pikku-http-response.js'

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
  ...runOptions
}: PikkuMiddlewareArgs): RequestHandler => {
  if (logRoutes) {
    logRegisterRoutes(logger)
  }
  if (loadSchemas) {
    compileAllSchemas(logger)
  }

  return async (req, res, next) => {
    const request = new ExpressPikkuHTTPRequest(req)
    const response = new ExpressPikkuHTTPResponse(res)
    await fetchData(request, response, {
      respondWith404,
      coerceDataFromSchema,
      ...runOptions,
    })
    response.flush()
    next()
  }
}
