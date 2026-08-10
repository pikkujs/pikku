/**
 * The surface a package in the Pikku ecosystem reaches for — a runtime adapter,
 * a service, the code generator's output, the CLI — and application code does
 * not.
 *
 * Split out from the package root so 1.0's compatibility promise covers what
 * applications actually import. These signatures move when the runtime needs
 * them to — `runPikkuFunc` was reshaped over the last year while every field on
 * `PikkuWire` survived — and promising stability on both would mean promising
 * the weaker of the two.
 *
 * Not `/internal`: generated bootstrap files import from here, so the specifier
 * lands in the user's own `.pikku` directory, and telling someone they are
 * touching internals when the code generator put it there is both wrong and
 * self-defeating — it could never be broken anyway. Not `/runtime` either: that
 * reads as runtime-versus-compile-time, i.e. the real API, and `packages/runtimes/*`
 * already claims the word while the CLI is the largest consumer here.
 *
 * `/internal` stays as an alias because the pinned bootstrap CLI still emits it.
 *
 * knowledge: decisions/internals/the-ecosystem-entry-point-carries-the-adapter-surface.md
 */
export {
  pikkuState,
  resetPikkuState,
  getAllPackageStates,
  getSingletonServices,
  getCreateWireServices,
  setSingletonServices,
} from './pikku-state.js'
export { runPikkuFunc, addFunction } from './function/function-runner.js'
export {
  addGlobalMiddleware,
  addTagMiddleware as addMiddleware,
} from './middleware-runner.js'
export { httpRouter } from './wirings/http/routers/http-router.js'
export type {
  CreateSingletonServices,
  CreateWireServices,
} from './types/core.types.js'
