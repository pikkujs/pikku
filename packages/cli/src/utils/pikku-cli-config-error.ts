import { PikkuError } from '@pikku/core/errors'

/**
 * A config that was found and parsed, but says something impossible — or one
 * that could not be found at all.
 *
 * Its message reaches the developer verbatim — every other error out of the
 * loader is reported as "failed to load", which sends the reader hunting for a
 * broken file rather than the line that is wrong. A `PikkuError`, so the CLI
 * prints that message alone: a stack through the config loader is never the
 * answer to "which line of my config is wrong", and `--verbose` / `PIKKU_DEBUG`
 * still shows it for the times it is.
 */
export class PikkuCLIConfigError extends PikkuError {}
