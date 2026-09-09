import { PikkuError } from '@pikku/core/errors'

/**
 * A fabric command refusing to run because something the user controls is not
 * ready yet — a dirty tree, a branch with no upstream, a local head that is not
 * the remote's, a required argument left off.
 *
 * These are not crashes. They are the outcomes the command exists to check for,
 * and every message is already written as an instruction ("Push or pull main
 * before deploying"). Raised as a `PikkuError`, which is how the rest of the
 * repo marks an error whose message is the whole output: `formatCLIError` prints
 * it alone, and keeps the full stack for everything else — an unexpected
 * `TypeError` with its frames removed is a bug nobody can diagnose. `--verbose`
 * or `PIKKU_DEBUG` still shows the stack when someone wants it.
 *
 * Thrown as a plain `Error` these read as a crash in pikku: ten frames of
 * `@pikku/core` function-runner and cli-runner internals in front of the one
 * sentence that says what to do. The exit code is unchanged — non-zero either
 * way.
 */
export class FabricPreconditionError extends PikkuError {}
