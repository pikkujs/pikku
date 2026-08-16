/**
 * Bootstrap compatibility, not a public entry point.
 *
 * The package root carried a 206-name barrel; it is gone, and every name now
 * lives on the subpath that owns it. What is left here is the handful of types
 * the CLI pinned in `packages/cli/build.sh` still writes into the files it
 * generates for the CLI itself — an unresolved type there is a silent `any` in
 * the CLI's own generated surface, not a build failure, which is why this
 * exists rather than letting it break loudly.
 *
 * `bootstrap-compat.test.ts` fails if the pinned CLI's output drifts from this
 * list. Delete this file and its `exports` entry once the pin moves to a CLI
 * released from this branch.
 */
export type { PikkuWire, SecretlessServices } from '../types/core.types.js'
export type { CorePikkuMiddleware } from '../middleware/middleware.types.js'
export type { PickRequired } from '../utils.js'
export type { CorePermissionGroup } from '../function/functions.types.js'
export type { ListInput, ListOutput } from '../function/list.types.js'
export type { SecretService } from '../services/secret-service.js'
