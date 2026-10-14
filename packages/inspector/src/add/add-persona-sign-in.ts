import * as ts from 'typescript'
import type { AddWiring } from '../types.js'

export const addPersonaSignIn: AddWiring = (_logger, node, _checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }
  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'wirePersonaSignIn') {
    return
  }
  state.personas.signInFiles.add(node.getSourceFile().fileName)
}
