import type * as uWS from 'uWebSockets.js'

import type { Logger } from '@pikku/core/ecosystem/services'
import type {
  HTTPMethod,
  RunHTTPWiringOptions,
} from '@pikku/core/ecosystem/http'
import { fetchData } from '@pikku/core/ecosystem/http'
import {
  DEFAULT_MAX_BODY_SIZE,
  logRoutes as logRegisterRoutes,
} from '@pikku/core/ecosystem/http'
import { PayloadTooLargeError } from '@pikku/core/ecosystem/errors'
import { compileAllSchemas } from '@pikku/core/ecosystem/schema'

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

  const maxBodySize = runOptions.maxBodySize ?? DEFAULT_MAX_BODY_SIZE

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

    if (method === 'get' || method === 'head' || method === 'options') {
      const request = new UWSPikkuHTTPRequest(method, path, query, headers)
      const response = new UWSPikkuHTTPResponse(res, isAborted)

      fetchData(request, response, runOptions)
        .then(() => response.flush())
        .catch(handleError)
    } else {
      let buffer: Buffer | undefined
      let received = 0

      // uWS hands over raw chunks with no limit of its own, so the bound has to
      // be counted here — and once it is breached the chunks are dropped rather
      // than concatenated, so an oversized request never sits in memory.
      const declared = Number(headers['content-length'])
      let oversized = Number.isFinite(declared) && declared > maxBodySize

      const rejectOversized = () => {
        const response = new UWSPikkuHTTPResponse(res, isAborted)
        const error = new PayloadTooLargeError(
          `Request body exceeds the maximum size of ${maxBodySize} bytes`
        )
        response.status(413).json({ name: error.name, message: error.message })
        response.flush()
      }

      res.onData((ab, isLast) => {
        if (!oversized) {
          const chunk = Buffer.from(ab)
          received += chunk.byteLength
          if (received > maxBodySize) {
            oversized = true
            buffer = undefined
          } else {
            buffer = buffer
              ? Buffer.concat([buffer, chunk])
              : Buffer.from(chunk)
          }
        }

        if (isLast) {
          if (oversized) {
            rejectOversized()
            return
          }

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
