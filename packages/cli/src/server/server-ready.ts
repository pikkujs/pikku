/**
 * The readiness handshake, owned by `@pikku/deploy` so the CLI and the
 * standalone provider's generated server entry print and wait on the same
 * string. Re-exported here because `--spawn` and the dev/serve commands have
 * always imported it from this path.
 *
 * @see {@link SERVER_READY_MARKER} for why `listening on …` is not readiness.
 */
export { SERVER_READY_MARKER, serverReadyLine } from '@pikku/deploy'
