import * as ts from 'typescript'
import { randomUUID } from 'crypto'

export type ExtractedFunctionName = {
  pikkuFuncId: string
  name: string
  explicitName: string | null
  exportedName: string | null
  propertyName: string | null
}

export function makeContextBasedId(
  wiringType: string,
  ...segments: string[]
): string {
  return [wiringType, ...segments].join(':')
}

export function funcIdToTypeName(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

export function extractFunctionName(
  callExpr: ts.Node,
  checker: ts.TypeChecker,
  rootDir: string
): ExtractedFunctionName {
  const parent: any = callExpr.parent

  // Initialize the result
  const result: ExtractedFunctionName = {
    pikkuFuncId: '',
    name: '',
    exportedName: null,
    propertyName: null,
    explicitName: null,
  }

  const workflowHelpers = new Set([
    'workflow',
    'workflowStart',
    'workflowStatus',
    'graphStart',
  ])

  if (
    ts.isCallExpression(callExpr) &&
    ts.isIdentifier(callExpr.expression) &&
    workflowHelpers.has(callExpr.expression.text)
  ) {
    const helperName = callExpr.expression.text
    const [firstArg, secondArg] = callExpr.arguments
    if (firstArg && ts.isStringLiteral(firstArg)) {
      const workflowName = firstArg.text
      let funcName: string
      if (
        helperName === 'graphStart' &&
        secondArg &&
        ts.isStringLiteral(secondArg)
      ) {
        funcName = `${helperName}:${workflowName}:${secondArg.text}`
      } else {
        funcName = `${helperName}:${workflowName}`
      }
      result.pikkuFuncId = funcName
      result.name = funcName
      result.explicitName = funcName
      return result
    }
  }

  // Special case for wireHTTP: if this is an identifier within an object literal,
  // it might be coming from the HTTP route handling flow
  if (
    ts.isIdentifier(callExpr) &&
    callExpr.parent &&
    ts.isPropertyAssignment(callExpr.parent)
  ) {
    // Try to handle the special case for HTTP route functions
    const sym = checker.getSymbolAtLocation(callExpr)
    if (sym) {
      let resolvedSym = sym
      if (resolvedSym.flags & ts.SymbolFlags.Alias) {
        resolvedSym = checker.getAliasedSymbol(resolvedSym) ?? resolvedSym
      }

      const decls = resolvedSym.declarations ?? []
      if (decls.length > 0) {
        const decl = decls[0]!
        // Check if the declaration is a variable that uses a pikkuFun
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          if (
            ts.isCallExpression(decl.initializer) &&
            ts.isIdentifier(decl.initializer.expression) &&
            decl.initializer.expression.text.startsWith('pikku')
          ) {
            const args = decl.initializer.arguments
            const firstArg = args[0]
            if (
              firstArg &&
              (ts.isArrowFunction(firstArg) ||
                ts.isFunctionExpression(firstArg))
            ) {
              // Continue with name extraction
              if (ts.isIdentifier(parent.name)) {
                result.propertyName = parent.name.text
              }

              if (
                ts.isVariableDeclaration(decl) &&
                isNamedExport(decl, checker) &&
                ts.isIdentifier(decl.name)
              ) {
                result.exportedName = decl.name.text
                result.pikkuFuncId = decl.name.text
              }

              if (!result.pikkuFuncId) {
                result.pikkuFuncId = `__temp_${randomUUID()}`
              }

              populateNameByPriority(result)
              return result
            }
          }
        }
      }
    }
  }

  if (ts.isCallExpression(callExpr)) {
    const { expression, arguments: args } = callExpr

    // Check if this is a pikku function call (pikkuFunc, pikkuSessionlessFunc, etc)
    if (ts.isIdentifier(expression) && expression.text.startsWith('pikku')) {
      // Check for object with 'name' property in first argument
      const firstArg = args[0]
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        for (const prop of firstArg.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'override' &&
            ts.isStringLiteral(prop.initializer)
          ) {
            // Priority 1: Object with override property
            result.explicitName = prop.initializer.text
            break
          }
        }
      }

      // Special handling for pikkuSessionlessFunc pattern - use the arrow function directly
      if (expression.text.startsWith('pikku')) {
        if (args.length > 0) {
          const firstArg = args[0]!
          if (
            ts.isArrowFunction(firstArg) ||
            ts.isFunctionExpression(firstArg)
          ) {
            // mainFunc = firstArg // Use the arrow function directly instead of the call expression
          }
        }
      }
    }

    // Handle object initializer with a func property (for both patterns)
    if (args.length > 0) {
      const firstArg = args[0]
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        // Look for func property in the object
        for (const prop of firstArg.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'func'
          ) {
            if (ts.isIdentifier(prop.initializer)) {
              // func: someFunction - resolve the function
              const funcSym = checker.getSymbolAtLocation(prop.initializer)
              if (funcSym) {
                let resolvedFuncSym = funcSym
                if (resolvedFuncSym.flags & ts.SymbolFlags.Alias) {
                  resolvedFuncSym =
                    checker.getAliasedSymbol(resolvedFuncSym) ?? resolvedFuncSym
                }

                const funcDecls = resolvedFuncSym.declarations ?? []
                if (funcDecls.length > 0) {
                  const funcDecl = funcDecls[0]!
                  // Check if it's a pikkuSessionlessFunc
                  if (
                    ts.isVariableDeclaration(funcDecl) &&
                    funcDecl.initializer
                  ) {
                    if (
                      ts.isCallExpression(funcDecl.initializer) &&
                      ts.isIdentifier(funcDecl.initializer.expression) &&
                      funcDecl.initializer.expression.text.startsWith('pikku')
                    ) {
                      const funcArgs = funcDecl.initializer.arguments
                      const firstArg = funcArgs[0]
                      if (
                        firstArg &&
                        (ts.isArrowFunction(firstArg) ||
                          ts.isFunctionExpression(firstArg))
                      ) {
                        // mainFunc = firstArg

                        // Check if the variable is exported
                        if (
                          isNamedExport(funcDecl, checker) &&
                          ts.isIdentifier(funcDecl.name)
                        ) {
                          result.exportedName = funcDecl.name.text
                        }

                        break
                      }
                    } else if (
                      ts.isFunctionExpression(funcDecl.initializer) ||
                      ts.isArrowFunction(funcDecl.initializer)
                    ) {
                      if (
                        isNamedExport(funcDecl, checker) &&
                        ts.isIdentifier(funcDecl.name)
                      ) {
                        result.exportedName = funcDecl.name.text
                      }

                      break
                    }
                  } else if (ts.isFunctionDeclaration(funcDecl)) {
                    // mainFunc = funcDecl

                    // Check if the function is exported
                    if (
                      funcDecl.modifiers?.some(
                        (m) => m.kind === ts.SyntaxKind.ExportKeyword
                      ) &&
                      funcDecl.name &&
                      ts.isIdentifier(funcDecl.name)
                    ) {
                      result.exportedName = funcDecl.name.text
                    }

                    break
                  }
                }
              } else {
                // If we can't resolve the symbol, use the identifier itself
                // mainFunc = prop.initializer
              }
              break
            } else if (
              ts.isFunctionExpression(prop.initializer) ||
              ts.isArrowFunction(prop.initializer)
            ) {
              // func: () => {} or func: function() {} - use directly
              // mainFunc = prop.initializer
              break
            }
          } else if (
            ts.isShorthandPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'func'
          ) {
            // Handle func shorthand property
            const shorthandSym = checker.getShorthandAssignmentValueSymbol(prop)
            if (
              shorthandSym &&
              shorthandSym.declarations &&
              shorthandSym.declarations.length > 0
            ) {
              const shorthandDecl = shorthandSym.declarations[0]
              if (!shorthandDecl) {
                throw new Error('No shorthand declaration found')
              }
              if (
                ts.isVariableDeclaration(shorthandDecl) &&
                shorthandDecl.initializer
              ) {
                if (
                  ts.isCallExpression(shorthandDecl.initializer) &&
                  ts.isIdentifier(shorthandDecl.initializer.expression) &&
                  shorthandDecl.initializer.expression.text.startsWith('pikku')
                ) {
                  const args = shorthandDecl.initializer.arguments
                  const firstArg = args[0]
                  if (
                    firstArg &&
                    (ts.isArrowFunction(firstArg) ||
                      ts.isFunctionExpression(firstArg))
                  ) {
                    // mainFunc = firstArg

                    // Check if the variable is exported
                    if (
                      isNamedExport(shorthandDecl, checker) &&
                      ts.isIdentifier(shorthandDecl.name)
                    ) {
                      result.exportedName = shorthandDecl.name.text
                    }

                    break
                  }
                } else if (
                  ts.isFunctionExpression(shorthandDecl.initializer) ||
                  ts.isArrowFunction(shorthandDecl.initializer)
                ) {
                  if (
                    isNamedExport(shorthandDecl, checker) &&
                    ts.isIdentifier(shorthandDecl.name)
                  ) {
                    result.exportedName = shorthandDecl.name.text
                  }

                  break
                }
              } else if (ts.isFunctionDeclaration(shorthandDecl)) {
                // mainFunc = shorthandDecl

                // Check if the function is exported
                if (
                  shorthandDecl.modifiers?.some(
                    (m) => m.kind === ts.SyntaxKind.ExportKeyword
                  ) &&
                  shorthandDecl.name &&
                  ts.isIdentifier(shorthandDecl.name)
                ) {
                  result.exportedName = shorthandDecl.name.text
                }

                break
              }
            }
          }
        }
      }
    }
  }
  // Handle direct identifier case
  else if (ts.isIdentifier(callExpr)) {
    const sym = checker.getSymbolAtLocation(callExpr)
    if (sym) {
      let resolvedSym = sym
      if (resolvedSym.flags & ts.SymbolFlags.Alias) {
        resolvedSym = checker.getAliasedSymbol(resolvedSym) ?? resolvedSym
      }

      const decls = resolvedSym.declarations ?? []
      if (decls.length > 0) {
        const decl = decls[0]
        if (!decl) {
          throw new Error('No declaration found')
        }
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          if (
            ts.isCallExpression(decl.initializer) &&
            ts.isIdentifier(decl.initializer.expression) &&
            decl.initializer.expression.text.startsWith('pikku')
          ) {
            // Check for object with 'override' property in first argument
            const firstArg = decl.initializer.arguments[0]
            if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
              for (const prop of firstArg.properties) {
                if (
                  ts.isPropertyAssignment(prop) &&
                  ts.isIdentifier(prop.name) &&
                  prop.name.text === 'override' &&
                  ts.isStringLiteral(prop.initializer)
                ) {
                  // Priority 1: Object with override property
                  result.explicitName = prop.initializer.text
                  break
                }
              }
            }

            if (decl.initializer.expression.text.startsWith('pikku')) {
              if (
                firstArg &&
                (ts.isArrowFunction(firstArg) ||
                  ts.isFunctionExpression(firstArg))
              ) {
                // mainFunc = firstArg
              }
            }

            // Check if the variable is exported
            if (isNamedExport(decl, checker) && ts.isIdentifier(decl.name)) {
              result.exportedName = decl.name.text
            }
          } else if (
            ts.isFunctionExpression(decl.initializer) ||
            ts.isArrowFunction(decl.initializer)
          ) {
            // mainFunc = decl.initializer

            // Check if the variable is exported
            if (isNamedExport(decl, checker) && ts.isIdentifier(decl.name)) {
              result.exportedName = decl.name.text
            }
          }
        } else if (ts.isFunctionDeclaration(decl)) {
          // mainFunc = decl

          // Check if the function is exported
          if (
            decl.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.ExportKeyword
            ) &&
            decl.name &&
            ts.isIdentifier(decl.name)
          ) {
            result.exportedName = decl.name.text
          }
        }
      }
    }
  }

  // 1) const foo = pikkuFunc(...)
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    if (isNamedExport(parent, checker)) {
      result.exportedName = parent.name.text
    }
  }
  // 2) { foo: pikkuFunc(...) }
  else if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    result.propertyName = parent.name.text
  }
  // 2b) Handle shorthand property { foo } - which is equivalent to { foo: foo }
  else if (
    ts.isShorthandPropertyAssignment(parent) &&
    ts.isIdentifier(parent.name)
  ) {
    result.propertyName = parent.name.text
  }
  // 3) Handle any remaining cases for pikkuFunc({ override: '…', func: … })
  else if (ts.isCallExpression(callExpr)) {
    const firstArg = callExpr.arguments[0]
    if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
      for (const prop of firstArg.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'override' &&
          ts.isStringLiteral(prop.initializer) &&
          !result.explicitName // Only set if not already set
        ) {
          result.explicitName = prop.initializer.text
          break
        }
      }
    }
  }

  // Apply name priority logic
  populateNameByPriority(result)

  if (result.explicitName) {
    result.pikkuFuncId = result.explicitName
  } else if (result.exportedName) {
    result.pikkuFuncId = result.exportedName
  } else {
    result.pikkuFuncId = `__temp_${randomUUID()}`
  }

  return result
}

/**
 * Helper function to populate the 'name' field based on priority
 */
export function populateNameByPriority(result: ExtractedFunctionName): void {
  // Priority 1: If we have an explict name, use that
  if (result.explicitName) {
    result.name = result.explicitName
  }
  // Priority 2: If we have an exported name, use that
  else if (result.exportedName) {
    result.name = result.exportedName
  }
  // Fallback: Use the deterministic name, but we could shorten it in the future
  else {
    // For now, just use the full pikkuFuncId
    result.name = result.pikkuFuncId
  }
}

/**
 * Helper function to check if a variable declaration is a named export
 */
export function isNamedExport(
  declaration: ts.VariableDeclaration,
  checker?: ts.TypeChecker
): boolean {
  let parent: any = declaration.parent
  if (!parent) return false

  if (ts.isVariableDeclarationList(parent)) {
    parent = parent.parent
    if (!parent) return false

    if (ts.isVariableStatement(parent)) {
      if (
        parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        return true
      }
    }
  }

  if (checker && ts.isIdentifier(declaration.name)) {
    const sourceFile = declaration.getSourceFile()
    const sourceFileSymbol = checker.getSymbolAtLocation(sourceFile)
    if (sourceFileSymbol) {
      const exports = checker.getExportsOfModule(sourceFileSymbol)
      const declSymbol = checker.getSymbolAtLocation(declaration.name)
      if (declSymbol) {
        return exports.some((exp) => {
          let resolved = exp
          if (resolved.flags & ts.SymbolFlags.Alias) {
            resolved = checker.getAliasedSymbol(resolved) ?? resolved
          }
          return resolved === declSymbol
        })
      }
    }
  }

  return false
}
