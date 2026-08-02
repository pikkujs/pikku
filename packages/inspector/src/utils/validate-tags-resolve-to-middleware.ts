import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, InspectorState } from '../types.js'

/**
 * An addon tag naming middleware nobody registered.
 *
 * `wireAddon({ tags: ['admin'] })` reads like a gate and is applied like one —
 * right up until no `addTagMiddleware('admin', …)` exists, at which point it
 * resolves to an empty list and every request sails through. Nothing at runtime
 * distinguishes "this tag runs three middlewares" from "this tag does nothing".
 *
 * Only **addon** tags are reported. A tag on a function is just as likely to be
 * organizational — grouping, documentation, OpenAPI — and warning about every
 * one of those would bury the case that matters. A tag on `wireAddon` is
 * different: it is the documented way to apply a gate across a whole addon, so
 * an inert one is never decorative. An exposed function relying on a tag it
 * has no other gate behind is already reported by
 * `validateExposedFunctionsGated`, which does not count tags as a gate.
 *
 * knowledge: decisions/security/addon-auth-and-tags-only-tighten.md
 */
export function validateTagsResolveToMiddleware(
  logger: InspectorLogger,
  state: InspectorState
): void {
  const registered = new Set<string>([
    ...state.middleware.tagMiddleware.keys(),
    ...state.channelMiddleware.tagMiddleware.keys(),
  ])

  for (const [namespace, declaration] of state.rpc?.wireAddonDeclarations ??
    []) {
    for (const tag of declaration.tags ?? []) {
      if (registered.has(tag)) continue

      logger.diagnostic({
        severity: 'warn',
        code: ErrorCode.TAG_RESOLVES_TO_NO_MIDDLEWARE,
        message:
          `wireAddon('${namespace}') declares tag '${tag}', but no ` +
          `addTagMiddleware('${tag}', …) registers anything for it. The tag ` +
          `resolves to an empty middleware list, so it applies no gate to the ` +
          `addon at all. Register middleware for it, or drop the tag if it is ` +
          `only meant to group and document.`,
      })
    }
  }
}
