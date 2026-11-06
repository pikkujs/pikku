import { ErrorCode } from '@pikku/inspector'
import type { SurfaceError } from './surface-doc.types.js'

/**
 * Prose, like the leaf editorial, for the codes whose diagnostic does not say
 * enough on its own. Every other code still answers `pikku doc`, with its name
 * and its docs page.
 */
const ERROR_EDITORIAL: Partial<
  Record<ErrorCode, Pick<SurfaceError, 'meaning' | 'fix'>>
> = {
  [ErrorCode.INVALID_DSL_WORKFLOW]: {
    meaning:
      'A `pikkuWorkflowFunc` body is read statically into a step graph, and this one has a shape the reader cannot follow. The diagnostic quotes the rule it broke. "Could not determine input parameter name" means the second parameter is destructured.',
    fix: 'Take the input as a plain name (`data`), not `{ orderId }`, and read `data.orderId` in the body. Declare `const`/`let` at the top level of the body and assign inside the block. Bind a step result to one name and read its properties, rather than destructuring it. Replace try/catch around steps with `compensate` on the function, and `while`/`for` with `for..of`. Give `workflow.approval` a literal or template string as its reason. Await every workflow call. Do not move to `pikkuWorkflowComplexFunc` to escape this: it gives up the step graph.',
  },
  [ErrorCode.SINGLE_STEP_WORKFLOW]: {
    meaning:
      'The workflow runs at most one RPC step and never sleeps, suspends, waits at an approval or fans out, so it buys nothing a workflow is for.',
    fix: 'Call the function directly, or enqueue it on a queue worker if it must survive a restart.',
  },
  [ErrorCode.DISABLED_FUNCTION_REFERENCED]: {
    meaning:
      'A function declared `disabled` is still used by a wiring, a call or a workflow step.',
    fix: 'Remove what uses it, or remove `disabled`.',
  },
  [ErrorCode.PERMISSION_DATA_UNUSED]: {
    meaning:
      'A `pikkuPermission` never reads its data argument, so it answers from the session alone. A `pikkuPermission` is for a check on the input, such as loading the row the caller named. A `pikkuAuth` receives only the services and the session, and can be evaluated before the input exists, which is how an agent is offered only the tools its session may use. A warning, or a critical under `--strict-meta` and `pikku verify --strict`. A handler passed by reference, a rest or destructured argument, and a check that reads a wire other than `session` are not reported.',
    fix: 'Replace `pikkuPermission(async (services, _data, { session }) => ...)` with `pikkuAuth(async (services, session) => ...)`. If the check does need the input, read it. Before switching a check that passes with no session, note that `pikkuAuth` refuses any caller with no session without running the check: as a global permission that would close every public route.',
  },
  [ErrorCode.UNUSED_FUNCTION]: {
    meaning: 'Nothing wires, exposes or calls this function.',
    fix: 'Use it, or mark it `disabled`. Disabling it can leave what it called unused in turn, so run the build again.',
  },
}

export const buildSurfaceErrors = (): SurfaceError[] =>
  Object.entries(ErrorCode)
    .map(([name, code]) => ({ code, name, ...ERROR_EDITORIAL[code] }))
    .sort((a, b) => a.code.localeCompare(b.code))
