/**
 * A config that was found and parsed, but says something impossible.
 *
 * Its message reaches the developer verbatim — every other error out of the
 * loader is reported as "failed to load", which sends the reader hunting for a
 * broken file rather than the line that is wrong.
 */
export class PikkuCLIConfigError extends Error {}
