import * as ts from 'typescript'
import type { AddWiring } from '../types.js'

export const addVirtualUserSignIn: AddWiring = (
  _logger,
  node,
  _checker,
  state
) => {
  if (!ts.isCallExpression(node)) {
    return
  }
  const expression = node.expression
  if (
    !ts.isIdentifier(expression) ||
    expression.text !== 'wireVirtualUserSignIn'
  ) {
    return
  }
  state.virtualUsers.signInFiles.add(node.getSourceFile().fileName)
}
