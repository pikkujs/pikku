import * as ts from 'typescript'
import { InspectorFilters, InspectorLogger } from './types.js'
import { PikkuWiringTypes, FunctionServicesMeta } from '@pikku/core'

type ExtractedFunctionName = {
  pikkuFuncName: string
  name: string
  explicitName: string | null
  exportedName: string | null
  localName: string | null
  propertyName: string | null
}

/**
 * Generate a deterministic "anonymous" name for any expression node,
 * but if it's an Identifier pointing to a function, resolve it back
 * to the function's declaration (so you get the true source location).
 */
export function makeDeterministicAnonName(
  start: ts.Node,
  checker: ts.TypeChecker
): string {
  let node: ts.Node = start
  let target: ts.Node = start

  // Handle the case where we're starting with an identifier directly
  if (ts.isIdentifier(node)) {
    const sym = checker.getSymbolAtLocation(node)
    if (sym) {
      let resolvedSym = sym
      if (resolvedSym.flags & ts.SymbolFlags.Alias) {
        resolvedSym = checker.getAliasedSymbol(resolvedSym) ?? resolvedSym
      }

      const decls = resolvedSym.declarations ?? []
      if (decls.length > 0) {
        // Start with the declaration, not the reference
        const decl = decls[0]!

        // If it's a variable declaration with a function initializer, use the function directly
        if (
          ts.isVariableDeclaration(decl) &&
          decl.initializer &&
          (ts.isFunctionExpression(decl.initializer) ||
            ts.isArrowFunction(decl.initializer))
        ) {
          target = decl.initializer
          // Return early - we found the function directly
          const sf = target.getSourceFile()
          const file = sf.fileName.replace(/[^A-Za-z0-9_]/g, '_')
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sf,
            target.getStart()
          )
          return `pikkuFn_${file}_L${line + 1}C${character + 1}`
        }
        // Otherwise continue resolution with the declaration
        node = decl
        target = decl!
      }
    }
  }

  // In an object literal property value, first try to resolve the identifier
  if (
    ts.isPropertyAssignment(node.parent) &&
    node === node.parent.initializer &&
    ts.isIdentifier(node)
  ) {
    const sym = checker.getSymbolAtLocation(node)
    if (sym) {
      // Process the symbol to find the real declaration
      let resolvedSym = sym
      if (resolvedSym.flags & ts.SymbolFlags.Alias) {
        resolvedSym = checker.getAliasedSymbol(resolvedSym) ?? resolvedSym
      }

      const decls = resolvedSym.declarations ?? []
      if (decls.length > 0) {
        // Found a declaration - use it as our new target
        const decl = decls[0]

        if (!decl) {
          throw new Error('No declaration found')
        }

        // If it's a variable declaration with an initializer function, use that
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          if (
            ts.isFunctionExpression(decl.initializer) ||
            ts.isArrowFunction(decl.initializer)
          ) {
            target = decl.initializer
            // Return early - we found the function directly
            const sf = target.getSourceFile()
            const file = sf.fileName.replace(/[^A-Za-z0-9_]/g, '_')
            const { line, character } = ts.getLineAndCharacterOfPosition(
              sf,
              target.getStart()
            )
            return `pikkuFn_${file}_L${line + 1}C${character + 1}`
          }
        } else if (ts.isFunctionDeclaration(decl)) {
          // Already a function declaration
          target = decl
          // Return early
          const sf = target.getSourceFile()
          const file = sf.fileName.replace(/[^A-Za-z0-9_]/g, '_')
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sf,
            target.getStart()
          )
          return `pikkuFn_${file}_L${line + 1}C${character + 1}`
        }

        // If we didn't return early, continue with this declaration
        node = decl
        target = decl
      }
    }
  }

  const seen = new Set<ts.Node>()
  for (let depth = 0; depth < 10; depth++) {
    if (!ts.isIdentifier(node) || seen.has(node)) break
    seen.add(node)

    let sym = checker.getSymbolAtLocation(node)
    if (!sym) break
    if (sym.flags & ts.SymbolFlags.Alias) {
      sym = checker.getAliasedSymbol(sym) ?? sym
    }

    const allDecls = sym.declarations ?? []
    // prefer real .ts/.tsx implementation files
    const implDecls = allDecls.filter(
      (d) => !d.getSourceFile().isDeclarationFile
    )
    const decls = implDecls.length ? implDecls : allDecls

    let didResolve = false
    for (const decl of decls) {
      // 1) direct function foo() {} or function-expression
      if (
        ts.isFunctionDeclaration(decl) ||
        ts.isFunctionExpression(decl) ||
        ts.isArrowFunction(decl)
      ) {
        target = decl
        didResolve = true
        break
      }

      // 2) const foo = () => {} or foo = function() {}
      if (ts.isVariableDeclaration(decl) && decl.initializer) {
        const init = decl.initializer
        if (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) {
          target = init
          didResolve = true
          break
        }
        // 2b) const foo = bar;  (follow the next identifier)
        if (ts.isIdentifier(init)) {
          node = init
          target = init
          didResolve = true
          break
        }
      }

      // 3) Handle shorthand property assignments: { foo } (equivalent to { foo: foo })
      if (ts.isShorthandPropertyAssignment(decl)) {
        // Get the symbol for the shorthand property
        const shorthandSym = checker.getShorthandAssignmentValueSymbol(decl)
        if (
          shorthandSym &&
          shorthandSym.declarations &&
          shorthandSym.declarations.length > 0
        ) {
          // Use the first declaration as our new target
          const shorthandDecl = shorthandSym.declarations[0]!
          target = shorthandDecl

          if (!shorthandDecl) {
            throw new Error('No shorthand declaration found')
          }

          // Check the type of declaration and extract the appropriate identifier to continue resolving
          if (
            ts.isVariableDeclaration(shorthandDecl) &&
            ts.isIdentifier(shorthandDecl.name)
          ) {
            node = shorthandDecl.name
            didResolve = true
            break
          } else if (
            ts.isFunctionDeclaration(shorthandDecl) &&
            shorthandDecl.name &&
            ts.isIdentifier(shorthandDecl.name)
          ) {
            node = shorthandDecl.name
            didResolve = true
            break
          } else if (
            ts.isParameter(shorthandDecl) &&
            ts.isIdentifier(shorthandDecl.name)
          ) {
            node = shorthandDecl.name
            didResolve = true
            break
          } else if (
            ts.isPropertyDeclaration(shorthandDecl) &&
            ts.isIdentifier(shorthandDecl.name)
          ) {
            node = shorthandDecl.name
            didResolve = true
            break
          } else if (
            ts.isMethodDeclaration(shorthandDecl) &&
            ts.isIdentifier(shorthandDecl.name)
          ) {
            node = shorthandDecl.name
            didResolve = true
            break
          }
        }
      }

      // 4) Handle method declarations in classes/objects
      if (ts.isMethodDeclaration(decl)) {
        target = decl
        didResolve = true
        break
      }

      // you can add more cases here if your setup uses imports, etc.
    }

    if (!didResolve) break
  }

  const sf = target.getSourceFile()
  const file = sf.fileName.replace(/[^A-Za-z0-9_]/g, '_')
  const { line, character } = ts.getLineAndCharacterOfPosition(
    sf,
    target.getStart()
  )
  return `pikkuFn_${file}_L${line + 1}C${character + 1}`
}

/**
 * Updated function to extract and prioritize function names correctly
 * This function follows the priority:
 * 1. Object with a name property
 * 2. Exported name
 * 3. Fallback to deterministic name
 */
export function extractFunctionName(
  callExpr: ts.Node,
  checker: ts.TypeChecker
): ExtractedFunctionName {
  const parent: any = callExpr.parent

  // Initialize the result
  const result: ExtractedFunctionName = {
    pikkuFuncName: '', // Will be populated later
    name: '', // This will hold our "best" name based on priority
    exportedName: null,
    localName: null,
    propertyName: null,
    explicitName: null,
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
              // Use the function directly for position calculation
              result.pikkuFuncName = makeDeterministicAnonName(
                firstArg,
                checker
              )

              // Continue with name extraction
              if (ts.isIdentifier(parent.name)) {
                result.propertyName = parent.name.text
              }

              // Check if the variable is exported
              if (
                ts.isVariableDeclaration(decl) &&
                isNamedExport(decl) &&
                ts.isIdentifier(decl.name)
              ) {
                result.exportedName = decl.name.text
                // CRITICAL FIX: Use exported name as pikkuFuncName for consistency
                result.pikkuFuncName = decl.name.text
              } else if (ts.isIdentifier(decl.name)) {
                // If not exported, still capture the variable name
                result.localName = decl.name.text
              }

              // Apply name priority logic
              populateNameByPriority(result)
              return result
            }
          }
        }
      }
    }
  }

  // First, figure out what function we're really dealing with
  let mainFunc = callExpr
  let originalCallExpr = callExpr // Keep track of the original call expression for name extraction

  // For direct pikku function calls where callExpr is the call expression itself
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
            prop.name.text === 'name' &&
            ts.isStringLiteral(prop.initializer)
          ) {
            // Priority 1: Object with name property
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
            mainFunc = firstArg // Use the arrow function directly instead of the call expression
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
                        mainFunc = firstArg

                        // Check if the variable is exported
                        if (
                          isNamedExport(funcDecl) &&
                          ts.isIdentifier(funcDecl.name)
                        ) {
                          result.exportedName = funcDecl.name.text
                        } else if (ts.isIdentifier(funcDecl.name)) {
                          // If not exported, still capture the variable name
                          result.localName = funcDecl.name.text
                        }

                        break
                      }
                    } else if (
                      ts.isFunctionExpression(funcDecl.initializer) ||
                      ts.isArrowFunction(funcDecl.initializer)
                    ) {
                      mainFunc = funcDecl.initializer

                      // Check if the variable is exported
                      if (
                        isNamedExport(funcDecl) &&
                        ts.isIdentifier(funcDecl.name)
                      ) {
                        result.exportedName = funcDecl.name.text
                      } else if (ts.isIdentifier(funcDecl.name)) {
                        // If not exported, still capture the variable name
                        result.localName = funcDecl.name.text
                      }

                      break
                    }
                  } else if (ts.isFunctionDeclaration(funcDecl)) {
                    mainFunc = funcDecl

                    // Check if the function is exported
                    if (
                      funcDecl.modifiers?.some(
                        (m) => m.kind === ts.SyntaxKind.ExportKeyword
                      ) &&
                      funcDecl.name &&
                      ts.isIdentifier(funcDecl.name)
                    ) {
                      result.exportedName = funcDecl.name.text
                    } else if (
                      funcDecl.name &&
                      ts.isIdentifier(funcDecl.name)
                    ) {
                      // If not exported, still capture the function name
                      result.localName = funcDecl.name.text
                    }

                    break
                  }
                }
              } else {
                // If we can't resolve the symbol, use the identifier itself
                mainFunc = prop.initializer
              }
              break
            } else if (
              ts.isFunctionExpression(prop.initializer) ||
              ts.isArrowFunction(prop.initializer)
            ) {
              // func: () => {} or func: function() {} - use directly
              mainFunc = prop.initializer
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
                    mainFunc = firstArg

                    // Check if the variable is exported
                    if (
                      isNamedExport(shorthandDecl) &&
                      ts.isIdentifier(shorthandDecl.name)
                    ) {
                      result.exportedName = shorthandDecl.name.text
                    } else if (ts.isIdentifier(shorthandDecl.name)) {
                      // If not exported, still capture the variable name
                      result.localName = shorthandDecl.name.text
                    }

                    break
                  }
                } else if (
                  ts.isFunctionExpression(shorthandDecl.initializer) ||
                  ts.isArrowFunction(shorthandDecl.initializer)
                ) {
                  mainFunc = shorthandDecl.initializer

                  // Check if the variable is exported
                  if (
                    isNamedExport(shorthandDecl) &&
                    ts.isIdentifier(shorthandDecl.name)
                  ) {
                    result.exportedName = shorthandDecl.name.text
                  } else if (ts.isIdentifier(shorthandDecl.name)) {
                    // If not exported, still capture the variable name
                    result.localName = shorthandDecl.name.text
                  }

                  break
                }
              } else if (ts.isFunctionDeclaration(shorthandDecl)) {
                mainFunc = shorthandDecl

                // Check if the function is exported
                if (
                  shorthandDecl.modifiers?.some(
                    (m) => m.kind === ts.SyntaxKind.ExportKeyword
                  ) &&
                  shorthandDecl.name &&
                  ts.isIdentifier(shorthandDecl.name)
                ) {
                  result.exportedName = shorthandDecl.name.text
                } else if (
                  shorthandDecl.name &&
                  ts.isIdentifier(shorthandDecl.name)
                ) {
                  // If not exported, still capture the function name
                  result.localName = shorthandDecl.name.text
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
            // Check for object with 'name' property in first argument
            const firstArg = decl.initializer.arguments[0]
            if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
              for (const prop of firstArg.properties) {
                if (
                  ts.isPropertyAssignment(prop) &&
                  ts.isIdentifier(prop.name) &&
                  prop.name.text === 'name' &&
                  ts.isStringLiteral(prop.initializer)
                ) {
                  // Priority 1: Object with name property
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
                mainFunc = firstArg
              }
            }

            // Check if the variable is exported
            if (isNamedExport(decl) && ts.isIdentifier(decl.name)) {
              result.exportedName = decl.name.text
            } else if (ts.isIdentifier(decl.name)) {
              // If not explicitly set by name property above, set functionName
              if (!result.localName) {
                result.localName = decl.name.text
              }
            }
          } else if (
            ts.isFunctionExpression(decl.initializer) ||
            ts.isArrowFunction(decl.initializer)
          ) {
            mainFunc = decl.initializer

            // Check if the variable is exported
            if (isNamedExport(decl) && ts.isIdentifier(decl.name)) {
              result.exportedName = decl.name.text
            } else if (ts.isIdentifier(decl.name)) {
              result.localName = decl.name.text
            }
          }
        } else if (ts.isFunctionDeclaration(decl)) {
          mainFunc = decl

          // Check if the function is exported
          if (
            decl.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.ExportKeyword
            ) &&
            decl.name &&
            ts.isIdentifier(decl.name)
          ) {
            result.exportedName = decl.name.text
          } else if (decl.name && ts.isIdentifier(decl.name)) {
            result.localName = decl.name.text
          }
        }
      }
    }
  }

  // Now generate the deterministic function name based on the resolved function
  result.pikkuFuncName = makeDeterministicAnonName(mainFunc, checker)

  // Continue with regular name extraction for remaining cases
  // 1) const foo = pikkuFunc(...)
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    if (isNamedExport(parent)) {
      result.exportedName = parent.name.text
    } else {
      // Still capture the variable name even if not exported
      result.localName = parent.name.text
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
  // 3) Handle any remaining cases for pikkuFunc({ name: '…', func: … })
  else if (ts.isCallExpression(originalCallExpr)) {
    const firstArg = originalCallExpr.arguments[0]
    if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
      for (const prop of firstArg.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'name' &&
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

  // CRITICAL FIX: If we have an exported name, use it as the pikkuFuncName for consistent lookup
  if (result.exportedName && !result.explicitName) {
    result.pikkuFuncName = result.exportedName
  }

  return result
}

/**
 * Helper function to populate the 'name' field based on priority
 */
function populateNameByPriority(result: ExtractedFunctionName): void {
  // Priority 1: If we have an explict name, use that
  if (result.explicitName) {
    result.name = result.explicitName
  }
  // Priority 2: If we have an exported name, use that
  else if (result.exportedName) {
    result.name = result.exportedName
  }
  // Priority 3: If we have a property name, use that
  // else if (result.propertyName) {
  //   result.name = result.propertyName
  // }
  // Fallback: Use the deterministic name, but we could shorten it in the future
  else {
    // For now, just use the full pikkuFuncName
    result.name = result.pikkuFuncName
  }
}

/**
 * Helper function to check if a variable declaration is a named export
 */
function isNamedExport(declaration: ts.VariableDeclaration): boolean {
  let parent: any = declaration.parent
  if (!parent) return false

  // Check if it's part of a variable declaration list
  if (ts.isVariableDeclarationList(parent)) {
    parent = parent.parent
    if (!parent) return false

    // Check if it's in an export declaration
    if (ts.isVariableStatement(parent)) {
      return (
        parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ??
        false
      )
    }
  }

  return false
}

// Until here
export const extractTypeKeys = (type: ts.Type): string[] => {
  return type.getProperties().map((symbol) => symbol.getName())
}

export function getPropertyAssignmentInitializer(
  obj: ts.ObjectLiteralExpression,
  propName: string,
  followShorthand = false,
  checker?: ts.TypeChecker
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    // ①  foo: () => {}
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propName
    ) {
      return prop.initializer
    }

    // ②  foo() { … }
    if (
      ts.isMethodDeclaration(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propName
    ) {
      return prop.name // the method node *is* the function
    }

    // ③  { foo }  (shorthand)
    if (
      followShorthand &&
      ts.isShorthandPropertyAssignment(prop) &&
      prop.name.text === propName
    ) {
      if (!checker) return prop.name // best effort without a checker

      let sym = checker.getSymbolAtLocation(prop.name)
      if (sym && sym.flags & ts.SymbolFlags.Alias) {
        sym = checker.getAliasedSymbol(sym)
      }

      const decl = sym?.declarations?.[0]

      // const foo = () => {}
      if (
        decl &&
        ts.isVariableDeclaration(decl) &&
        decl.initializer &&
        (ts.isArrowFunction(decl.initializer) ||
          ts.isFunctionExpression(decl.initializer))
      ) {
        return decl.initializer
      }

      // function foo() {}
      if (
        decl &&
        (ts.isFunctionDeclaration(decl) ||
          ts.isArrowFunction(decl) ||
          ts.isFunctionExpression(decl))
      ) {
        return decl as ts.Expression
      }

      // fallback – just give back the identifier
      return prop.name
    }
  }

  return undefined
}

export const matchesFilters = (
  filters: InspectorFilters,
  params: { tags?: string[] },
  meta: {
    type: PikkuWiringTypes
    name: string
    filePath?: string
  },
  logger: InspectorLogger
) => {
  // If no filters are provided, allow everything
  if (Object.keys(filters).length === 0) {
    return true
  }

  // If all filter arrays are empty, allow everything
  if (
    (!filters.tags || filters.tags.length === 0) &&
    (!filters.types || filters.types.length === 0) &&
    (!filters.directories || filters.directories.length === 0)
  ) {
    return true
  }

  // Check type filter
  if (filters.types && filters.types.length > 0) {
    if (!filters.types.includes(meta.type)) {
      logger.debug(`⒡ Filtered by type: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // Check directory filter
  if (filters.directories && filters.directories.length > 0) {
    if (!meta.filePath) {
      logger.debug(
        `⒡ Filtered by directory: ${meta.type}:${meta.name} (${meta.filePath})`
      )
      return false
    }

    const matchesDirectory = filters.directories.some((dir) => {
      // Normalize paths for comparison
      const normalizedFilePath = meta.filePath!.replace(/\\/g, '/')
      const normalizedDir = dir.replace(/\\/g, '/')
      return normalizedFilePath.includes(normalizedDir)
    })

    if (!matchesDirectory) {
      logger.debug(
        `⒡ Filtered by directory: ${meta.type}:${meta.name} (${meta.filePath})`
      )
      return false
    }
  }

  // Check tag filter
  if (filters.tags && filters.tags.length > 0) {
    if (
      !params.tags ||
      !filters.tags.some((tag) => params.tags!.includes(tag))
    ) {
      logger.debug(`⒡ Filtered by tags: ${meta.type}:${meta.name}`)
      return false
    }
  }

  return true
}

/**
 * Extract services from a function's first parameter destructuring pattern
 */
export function extractServicesFromFunction(
  handlerNode: ts.FunctionExpression | ts.ArrowFunction
): FunctionServicesMeta {
  const services: FunctionServicesMeta = {
    optimized: true,
    services: [],
  }

  const firstParam = handlerNode.parameters[0]
  if (firstParam) {
    if (ts.isObjectBindingPattern(firstParam.name)) {
      for (const elem of firstParam.name.elements) {
        const original =
          elem.propertyName && ts.isIdentifier(elem.propertyName)
            ? elem.propertyName.text
            : ts.isIdentifier(elem.name)
              ? elem.name.text
              : undefined
        if (original) {
          services.services.push(original)
        }
      }
    } else if (ts.isIdentifier(firstParam.name)) {
      services.optimized = false
    }
  }

  return services
}
