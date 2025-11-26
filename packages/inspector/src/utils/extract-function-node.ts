import * as ts from 'typescript'
import {
  getPropertyAssignmentInitializer,
  resolveFunctionDeclaration,
} from './type-utils.js'

/**
 * Extracts the actual function node from a pikkuFunc/pikkuWorkflow call
 * Handles both direct function form and config object form { func: ... }
 */
export function extractFunctionNode(
  firstArg: ts.Expression,
  checker: ts.TypeChecker
): {
  funcNode: ts.Node
  resolvedFunc: ts.Node | null
  isDirectFunction: boolean
} {
  let funcNode: ts.Node = firstArg
  let isDirectFunction = true

  // Check if first argument is a config object with 'func' property
  if (ts.isObjectLiteralExpression(firstArg)) {
    isDirectFunction = false
    const funcInitializer = getPropertyAssignmentInitializer(
      firstArg,
      'func',
      true,
      checker
    )

    if (funcInitializer) {
      funcNode = funcInitializer
    } else {
      // Return the original node if no func property found
      // Caller should handle validation
      funcNode = firstArg
    }
  }

  // Resolve identifier to get the actual function node
  if (ts.isIdentifier(funcNode)) {
    const symbol = checker.getSymbolAtLocation(funcNode)
    const decl = symbol?.valueDeclaration || symbol?.declarations?.[0]
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
      funcNode = decl.initializer
    }
  }

  // Resolve function declaration for deeper analysis
  const resolvedFunc = resolveFunctionDeclaration(funcNode, checker)

  return {
    funcNode,
    resolvedFunc,
    isDirectFunction,
  }
}
