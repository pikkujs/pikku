import { PikkuError } from '@pikku/core/errors'

/**
 * A config that is missing, or that was found and parsed but says something
 * impossible.
 *
 * Its message reaches the developer verbatim — every other error out of the
 * loader is reported as "failed to load", which sends the reader hunting for a
 * broken file rather than the line that is wrong.
 *
 * A `PikkuError` because that is what keeps the stack trace off the screen:
 * "you are not in a pikku project" is an answer, not a crash, and the frames of
 * the loader that discovered it help nobody. `--verbose` still shows them.
 */
export class PikkuCLIConfigError extends PikkuError {}
