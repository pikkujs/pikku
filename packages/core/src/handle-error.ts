import { getErrorResponse } from './errors/error-handler.js'
import { NotFoundError } from './errors/errors.js'
import { Logger } from './services/logger.js'
import { PikkuHTTP } from './http/http-routes.types.js'

/**
 * Handle errors that occur during route processing
 *
 * @param {any} e - The error that occurred
 * @param {PikkuHTTP | undefined} http - HTTP interaction object
 * @param {string} trackerId - Unique ID for tracking this error
 * @param {Logger} logger - Logger service
 * @param {number[]} logWarningsForStatusCodes - HTTP status codes to log as warnings
 * @param {boolean} respondWith404 - Whether to respond with 404 for NotFoundError
 * @param {boolean} bubbleError - Whether to throw the error after handling
 */
export const handleError = (
  e: any,
  http: PikkuHTTP | undefined,
  trackerId: string,
  logger: Logger,
  logWarningsForStatusCodes: number[],
  respondWith404: boolean,
  bubbleError: boolean
) => {
  // Skip 404 handling if configured to do so
  if (e instanceof NotFoundError && !respondWith404) {
    return
  }

  // Get appropriate error response
  const errorResponse = getErrorResponse(e)

  if (errorResponse != null) {
    // Set status and response body
    http?.response?.setStatus(errorResponse.status)
    http?.response?.setJson({
      message: errorResponse.message,
      payload: (e as any).payload,
      traceId: trackerId,
    })

    // Log certain status codes as warnings
    if (logWarningsForStatusCodes.includes(errorResponse.status)) {
      logger.warn(`Warning id: ${trackerId}`)
      logger.warn(e)
    }
  } else {
    // Handle unexpected errors
    logger.warn(`Error id: ${trackerId}`)
    logger.error(e)
    http?.response?.setStatus(500)
    http?.response?.setJson({ errorId: trackerId })
  }

  // Handle 404 errors specifically
  if (e instanceof NotFoundError) {
    http?.response?.end()
  }

  // Either bubble up or end the response
  if (bubbleError) {
    throw e
  } else {
    http?.response?.end()
  }
}
