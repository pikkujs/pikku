import * as ts from 'typescript'

/** `x` seen through `x!` and `(x)`. */
function unwrap(node: ts.Expression): ts.Expression {
  let inner = node
  while (ts.isNonNullExpression(inner) || ts.isParenthesizedExpression(inner)) {
    inner = inner.expression
  }
  return inner
}

/** `rpc`, or anything ending in `.rpc` (`wire.rpc`), seen through `!` and parens. */
function isRpcExpression(node: ts.Expression): boolean {
  const inner = unwrap(node)
  return ts.isIdentifier(inner)
    ? inner.text === 'rpc'
    : ts.isPropertyAccessExpression(inner) && inner.name.text === 'rpc'
}

/** An argument that hands `rpc` over: `rpc`, `wire.rpc`, `{ rpc }`, `{ rpc: wire.rpc }`. */
function passesRpc(arg: ts.Expression): boolean {
  if (isRpcExpression(arg)) return true
  const inner = unwrap(arg)
  if (!ts.isObjectLiteralExpression(inner)) return false
  return inner.properties.some(
    (p) =>
      (ts.isShorthandPropertyAssignment(p) && p.name.text === 'rpc') ||
      (ts.isPropertyAssignment(p) && isRpcExpression(p.initializer))
  )
}

export type StartedWorkflows = {
  /** Workflow names passed as a literal to `rpc.startWorkflow(...)`. */
  names: string[]
  /** Source text of `rpc.startWorkflow(...)` calls whose name is computed. */
  dynamic: string[]
  /**
   * Plain functions the handler passes `rpc` to — calls made inside them are
   * not seen. Methods (`workflowService.runToCompletion(..., rpc)`) are left
   * out: they are services, not the app's own helpers.
   */
  rpcHandoffs: string[]
}

/**
 * The workflows a function handler starts through `rpc.startWorkflow(...)`,
 * read from its own body.
 *
 * `startWorkflow` looks the workflow up by name in the process that calls it,
 * so a deployed unit that starts a workflow needs that workflow's meta bundled
 * in. The deploy planner does that from these names.
 *
 * Only the handler's own body is read. When the handler passes `rpc` on to a
 * helper, whatever the helper starts is invisible here; those callees are
 * returned in `rpcHandoffs` so the caller can say so.
 */
export function collectStartedWorkflows(handler: ts.Node): StartedWorkflows {
  const names = new Set<string>()
  const dynamic: string[] = []
  const rpcHandoffs = new Set<string>()
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isRpcMethod =
        ts.isPropertyAccessExpression(callee) &&
        isRpcExpression(callee.expression)
      if (isRpcMethod && callee.name.text === 'startWorkflow') {
        const [firstArg] = node.arguments
        if (firstArg) {
          if (
            ts.isStringLiteral(firstArg) ||
            ts.isNoSubstitutionTemplateLiteral(firstArg)
          ) {
            names.add(firstArg.text)
          } else {
            dynamic.push(node.getText())
          }
        }
      } else if (ts.isIdentifier(callee) && node.arguments.some(passesRpc)) {
        rpcHandoffs.add(callee.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(handler)
  return {
    names: [...names].sort(),
    dynamic,
    rpcHandoffs: [...rpcHandoffs].sort(),
  }
}
