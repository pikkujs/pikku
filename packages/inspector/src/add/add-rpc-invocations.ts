import * as ts from 'typescript'
import { InspectorState, InspectorLogger } from '../types.js'

/**
 * Scan for rpc.invoke() calls to track which functions are actually being invoked
 * Also detects external package usage via namespaced calls: rpc.invoke('namespace:function')
 */
export function addRPCInvocations(
  node: ts.Node,
  state: InspectorState,
  logger: InspectorLogger
) {
  // Look for property access expressions: rpc.invoke
  if (ts.isPropertyAccessExpression(node)) {
    const { expression, name } = node

    // Check if this is accessing 'invoke' property
    if (name.text === 'invoke') {
      // Check if the object is 'rpc' (or a variable containing rpc)
      if (ts.isIdentifier(expression) && expression.text === 'rpc') {
        // This is rpc.invoke - now we need to find the parent call expression
        const parent = node.parent
        if (ts.isCallExpression(parent) && parent.expression === node) {
          // This is rpc.invoke('function-name') or rpc.invoke('namespace:function')
          const [firstArg] = parent.arguments
          if (firstArg) {
            // Extract the function name from string literal
            if (ts.isStringLiteral(firstArg)) {
              const functionRef = firstArg.text
              logger.debug(`• Found RPC invocation: ${functionRef}`)
              state.rpc.invokedFunctions.add(functionRef)

              // Check if this is a namespaced call (external package)
              const colonIndex = functionRef.indexOf(':')
              if (colonIndex !== -1) {
                const namespace = functionRef.substring(0, colonIndex)
                logger.debug(`  → External package detected: ${namespace}`)
                state.rpc.usedExternalPackages.add(namespace)
              }
            }
            // Handle template literals like `function-${name}`
            else if (
              ts.isTemplateExpression(firstArg) ||
              ts.isNoSubstitutionTemplateLiteral(firstArg)
            ) {
              logger.warn(
                `• Found dynamic RPC invocation: ${firstArg.getText()}`
              )
              logger.warn(
                `\tYou can only use string literals for RPC function names, with ' or " and not \``
              )
            }
          }
        }
      }
    }
  }
}
