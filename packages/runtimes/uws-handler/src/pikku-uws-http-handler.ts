import * as uWS from 'uWebSockets.js'

import type { Logger } from '@pikku/core/services'
import type { HTTPMethod } from '@pikku/core/http'
import {
  fetchData,
  logRoutes as logRegisterRoutes,
  RunHTTPWiringOptions,
} from '@pikku/core/http'
import { compileAllSchemas } from '@pikku/core/schema'

import { UWSPikkuHTTPRequest } from './uws-pikku-http-request.js'
import { UWSPikkuHTTPResponse } from './uws-pikku-http-response.js'

/**
 * Options for configuring the `pikkuHandler`.
 */
export type PikkuuWSHandlerOptions = {
  logger: Logger
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
  ...runOptions
}: PikkuuWSHandlerOptions) => {
  if (logRoutes) {
    logRegisterRoutes(logger)
  }
  if (loadSchemas) {
    compileAllSchemas(logger)
  }

  return (res: uWS.HttpResponse, req: uWS.HttpRequest): void => {
    let aborted = false

    const method = req.getMethod() as HTTPMethod
    const path = req.getUrl()
    const query = req.getQuery()
    const headers: Record<string, string> = {}
    req.forEach((key, value) => {
      headers[key] = value
    })

    res.onAborted(() => {
      aborted = true
    })

    const isAborted = () => aborted

    const handleError = (err: any) => {
      logger.error(`uWS HTTP error: ${err.message}`)
      if (!aborted) {
        try {
          res.cork(() => {
            res.writeStatus('500').end('Internal Server Error')
          })
        } catch {
          // response already sent or aborted
        }
      }
    }

    if (method === 'get' || method === 'head') {
      const request = new UWSPikkuHTTPRequest(method, path, query, headers)
      const response = new UWSPikkuHTTPResponse(res, isAborted)

      fetchData(request, response, runOptions)
        .then(() => response.flush())
        .catch(handleError)
    } else {
      let buffer: Buffer | undefined

      res.onData((ab, isLast) => {
        const chunk = Buffer.from(ab)
        buffer = buffer ? Buffer.concat([buffer, chunk]) : Buffer.from(chunk)

        if (isLast) {
          const request = new UWSPikkuHTTPRequest(
            method,
            path,
            query,
            headers,
            buffer
          )
          const response = new UWSPikkuHTTPResponse(res, isAborted)

          fetchData(request, response, runOptions)
            .then(() => response.flush())
            .catch(handleError)
        }
      })
    }
  }
}
