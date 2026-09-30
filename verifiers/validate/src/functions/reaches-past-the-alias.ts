/**
 * Deliberately wrong, and the whole point of this verifier: `NotFoundError`
 * and `parseDurationString` are reached in core rather than through `#pikku`.
 * `pikku validate` is expected to report both — one with the leaf that carries
 * it, one as a gap in what the CLI emits.
 *
 * The `@pikku/core/services` import beside them is the documented exception and
 * must stay unreported.
 */
import { NotFoundError } from '@pikku/core/errors'
import { parseDurationString } from '@pikku/core/utils'
import { ConsoleLogger } from '@pikku/core/services'

export const describeMiss = (window: string): string => {
  const logger = new ConsoleLogger()
  logger.info(String(parseDurationString(window)))
  return new NotFoundError('nothing here').message
}
