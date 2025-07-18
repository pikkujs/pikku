import { getErrorResponse } from './errors/error-handler.js'
import { NotFoundError } from './errors/errors.js'
import { Logger } from './services/logger.js'
import { PikkuHTTP } from './events/http/http.types.js'

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
export const handleHTTPError = (
  e: any,
  http: PikkuHTTP | undefined,
  trackerId: string | undefined,
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
    http?.response?.status(errorResponse.status)
    http?.response?.json({
      message: errorResponse.message,
      payload: (e as any).payload,
      traceId: trackerId,
    })

    // Log certain status codes as warnings
    if (logWarningsForStatusCodes.includes(errorResponse.status)) {
      if (trackerId) {
        logger.warn(`Warning id: ${trackerId}`)
      }
      logger.warn(e)
    }
  } else {
    // Handle unexpected errors
    logger.error(e)
    http?.response?.status(500)

    if (trackerId) {
      logger.warn(`Error id: ${trackerId}`)
      http?.response?.json({ errorId: trackerId })
    }
  }

  // Handle 404 errors specifically
  if (e instanceof NotFoundError) {
    // TODO
    // http?.response?.end()
  }

  // Either bubble up or end the response
  if (bubbleError) {
    throw e
  } else {
    // TODO
    // http?.response?.end()
  }
}
