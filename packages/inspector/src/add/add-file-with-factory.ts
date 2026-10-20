import * as ts from 'typescript'
import { relative } from 'node:path'
import type {
  PathToNameAndType,
  InspectorState,
  InspectorLogger,
} from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { extractServicesFromFunction } from '../utils/extract-services.js'

// Mapping of wrapper function names to their corresponding types
const wrapperFunctionMap: Record<string, string> = {
  pikkuConfig: 'CreateConfig',
  pikkuAddonConfig: 'CreateConfig',
  pikkuServices: 'CreateSingletonServices',
  pikkuAddonServices: 'CreateSingletonServices',
  pikkuWireServices: 'CreateWireServices',
  pikkuAddonWireServices: 'CreateWireServices',
  pikkuServerLifecycle: 'ServerLifecycle',
}

type Cast = { form: string; remove: string }

/** How a cast around an expression reads in a diagnostic, or undefined for none. */
const describeCast = (expression: ts.Expression): Cast | undefined => {
  if (ts.isAsExpression(expression)) {
    return { form: 'an `as` cast', remove: 'the cast' }
  }
  if (ts.isTypeAssertionExpression(expression)) {
    return { form: 'a `<T>` cast', remove: 'the cast' }
  }
  if (ts.isNonNullExpression(expression)) {
    return { form: 'a non-null assertion (`!`)', remove: 'the `!`' }
  }
  return undefined
}

/** `satisfies` and parentheses leave the value's type as written, so a factory inside them is read as a direct call. */
const isTransparent = (
  expression: ts.Expression
): expression is ts.SatisfiesExpression | ts.ParenthesizedExpression =>
  ts.isSatisfiesExpression(expression) ||
  ts.isParenthesizedExpression(expression)

const unwrapTransparent = (expression: ts.Expression): ts.Expression => {
  while (isTransparent(expression)) expression = expression.expression
  return expression
}

/**
 * A factory binding whose wrapper call sits inside a cast: `as`, `<T>` or `!`.
 * A cast changes the type the inspector would read, and hides a mismatch the
 * factory should fix, so it fails the build instead of being seen through.
 */
export const checkHiddenFactory = (
  logger: InspectorLogger,
  node: ts.Node,
  state: InspectorState
) => {
  if (!ts.isVariableDeclaration(node) || !node.initializer) return

  let inner: ts.Expression = node.initializer
  let cast: Cast | undefined
  for (;;) {
    const found = describeCast(inner)
    if (found) {
      cast ??= found
      inner = (inner as ts.AssertionExpression | ts.NonNullExpression)
        .expression
    } else if (isTransparent(inner)) {
      inner = inner.expression
    } else {
      break
    }
  }
  if (
    !cast ||
    !ts.isCallExpression(inner) ||
    !ts.isIdentifier(inner.expression) ||
    !wrapperFunctionMap[inner.expression.text]
  ) {
    return
  }

  const sourceFile = node.getSourceFile()
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
  const wrapper = inner.expression.text
  logger.critical(
    ErrorCode.FACTORY_NOT_A_DIRECT_CALL,
    `'${node.name.getText()}' at ${relative(state.rootDir, sourceFile.fileName)}:${line + 1} wraps ${wrapper}(...) in ${cast.form}. ` +
      `The inspector reads a factory only from a direct ${wrapper}(...) call, so this one would not be registered and nothing it provides would exist at runtime. ` +
      `Remove ${cast.remove}, and fix the type mismatch it hides in the factory itself.`
  )
}

/**
 * What an addon's services factory takes from the parent: the names
 * destructured off the parameter carrying the parent's bag, either in the
 * parameter list or from a `const { … } = existingServices` in the body.
 *
 * `pikkuAddonServices` receives it second, after the config;
 * `pikkuAddonWireServices` receives it first, ahead of the wire.
 */
const extractForwardedServices = (
  functionNode: ts.ArrowFunction | ts.FunctionExpression,
  servicesParamIndex: number
): string[] => {
  const forwarded: string[] = []
  const secondParam = functionNode.parameters[servicesParamIndex]
  if (!secondParam) return forwarded

  const collectBinding = (pattern: ts.ObjectBindingPattern) => {
    for (const elem of pattern.elements) {
      if (elem.dotDotDotToken) continue
      const name =
        elem.propertyName && ts.isIdentifier(elem.propertyName)
          ? elem.propertyName.text
          : ts.isIdentifier(elem.name)
            ? elem.name.text
            : undefined
      if (name) forwarded.push(name)
    }
  }

  if (ts.isObjectBindingPattern(secondParam.name)) {
    collectBinding(secondParam.name)
    return forwarded
  }

  if (!ts.isIdentifier(secondParam.name)) return forwarded
  const paramName = secondParam.name.text
  const body = functionNode.body
  if (!ts.isBlock(body)) return forwarded

  /**
   * A nested callback is free to name its own parameter `services` too. Its
   * destructuring belongs to that parameter, not the factory's, so descending
   * into it would put a service on the addon's contract the factory never
   * asked the parent for.
   */
  const shadowsParam = (node: ts.Node): boolean => {
    if (!ts.isFunctionLike(node)) return false
    return node.parameters.some((parameter) => bindsName(parameter.name))
  }

  const bindsName = (name: ts.BindingName): boolean => {
    if (ts.isIdentifier(name)) return name.text === paramName
    return name.elements.some(
      (element) => !ts.isOmittedExpression(element) && bindsName(element.name)
    )
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === paramName
    ) {
      collectBinding(node.name)
      return
    }
    if (shadowsParam(node)) return
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)

  return forwarded
}

/**
 * The service names the factory's returned object literals name. A spread is
 * skipped — it carries the parent's bag through rather than naming anything —
 * and a name the factory took off the parent is a forward, not a creation.
 */
const extractReturnedServices = (
  functionNode: ts.ArrowFunction | ts.FunctionExpression
): string[] => {
  const returned: string[] = []

  const collect = (expression: ts.Expression) => {
    while (ts.isParenthesizedExpression(expression)) {
      expression = expression.expression
    }
    if (!ts.isObjectLiteralExpression(expression)) return
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) continue
      const name = property.name
      if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
        returned.push(name.text)
      }
    }
  }

  const body = functionNode.body
  if (!ts.isBlock(body)) {
    collect(body)
    return returned
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      return
    }
    if (ts.isReturnStatement(node) && node.expression) {
      collect(node.expression)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)

  return returned
}

export const addFileWithFactory = (
  node: ts.Node,
  checker: ts.TypeChecker,
  methods: PathToNameAndType = new Map(),
  expectedTypeName: string,
  state?: InspectorState
) => {
  if (ts.isVariableDeclaration(node)) {
    const fileName = node.getSourceFile().fileName
    const variableTypeNode = node.type
    const variableName = node.name.getText()

    // Check for wrapper function calls FIRST (e.g., pikkuConfig(...), pikkuServices(...))
    // This handles both cases: with and without explicit type annotations
    const initializer = node.initializer && unwrapTransparent(node.initializer)
    if (initializer && ts.isCallExpression(initializer)) {
      const callExpression = initializer
      const expression = callExpression.expression

      if (ts.isIdentifier(expression)) {
        const wrapperFunctionName = expression.text
        const inferredType = wrapperFunctionMap[wrapperFunctionName]

        if (inferredType === expectedTypeName) {
          // Get the type declaration path from the wrapper function
          const typeSymbol = checker.getSymbolAtLocation(expression)
          let typeDeclarationPath: string | null = null

          if (
            typeSymbol &&
            typeSymbol.declarations &&
            typeSymbol.declarations[0]
          ) {
            const declaration = typeSymbol.declarations[0]
            const sourceFile = declaration.getSourceFile()
            typeDeclarationPath = sourceFile.fileName
          }

          const variables = methods.get(fileName) || []
          variables.push({
            variable: variableName,
            type: inferredType,
            typePath: typeDeclarationPath,
          })
          methods.set(fileName, variables)

          if (state && callExpression.arguments.length > 0) {
            const firstArg = callExpression.arguments[0]
            let functionNode:
              ts.ArrowFunction | ts.FunctionExpression | undefined

            if (ts.isArrowFunction(firstArg)) {
              functionNode = firstArg
            } else if (ts.isFunctionExpression(firstArg)) {
              functionNode = firstArg
            }

            // Extract singleton services for CreateWireServices factories
            if (expectedTypeName === 'CreateWireServices' && functionNode) {
              const servicesMeta = extractServicesFromFunction(functionNode)
              state.wireServicesMeta.set(variableName, servicesMeta.services)
            }

            // Extract existing services an addon needs from the parent
            // (second parameter of pikkuAddonServices callback). A wire
            // factory reads the same parent bag and returns services of its
            // own, so it declares the same contract — a service it builds per
            // wire is one the addon owns, not one its consumer owes.
            if (
              (wrapperFunctionName === 'pikkuAddonServices' ||
                wrapperFunctionName === 'pikkuAddonWireServices') &&
              functionNode
            ) {
              state.addonServicesFactorySeen = true
              const forwarded = new Set(
                extractForwardedServices(
                  functionNode,
                  wrapperFunctionName === 'pikkuAddonWireServices' ? 0 : 1
                )
              )
              for (const name of forwarded) {
                state.addonRequiredParentServices.push(name)
              }
              for (const name of extractReturnedServices(functionNode)) {
                if (!forwarded.has(name)) {
                  state.addonCreatedServices.push(name)
                }
              }
            }
          }

          return // Early return since we found a match
        }
      }
    }

    if (variableTypeNode && ts.isTypeReferenceNode(variableTypeNode)) {
      const typeNameNode = variableTypeNode.typeName || null

      let typeDeclarationPath: string | null = null

      // Check if the type name matches the expected type name
      if (
        ts.isIdentifier(typeNameNode) &&
        typeNameNode.text === expectedTypeName
      ) {
        const typeSymbol = checker.getSymbolAtLocation(typeNameNode)
        const declaration =
          typeSymbol && typeSymbol.declarations && typeSymbol.declarations[0]
        if (declaration) {
          const sourceFile = declaration.getSourceFile()
          typeDeclarationPath = sourceFile.fileName // Get the path of the file where the type was declared
        }

        const variables = methods.get(fileName) || []
        variables.push({
          variable: variableName,
          type: typeNameNode.getText(),
          typePath: typeDeclarationPath,
        })
        methods.set(fileName, variables)

        // Extract singleton services for CreateWireServices factories
        if (
          expectedTypeName === 'CreateWireServices' &&
          state &&
          node.initializer
        ) {
          let functionNode: ts.ArrowFunction | ts.FunctionExpression | undefined
          if (ts.isArrowFunction(node.initializer)) {
            functionNode = node.initializer
          } else if (ts.isFunctionExpression(node.initializer)) {
            functionNode = node.initializer
          }

          if (functionNode) {
            const servicesMeta = extractServicesFromFunction(functionNode)
            state.wireServicesMeta.set(variableName, servicesMeta.services)
          }
        }
      }

      // Handle qualified type names if necessary
      else if (ts.isQualifiedName(typeNameNode)) {
        const lastName = typeNameNode.right.text
        if (lastName === expectedTypeName) {
          const typeSymbol = checker.getSymbolAtLocation(typeNameNode.right)
          const declaration =
            typeSymbol && typeSymbol.declarations && typeSymbol.declarations[0]
          if (declaration) {
            const sourceFile = declaration.getSourceFile()
            typeDeclarationPath = sourceFile.fileName // Get the path of the file where the type was declared
          }

          const variables = methods.get(fileName) || []
          variables.push({
            variable: variableName,
            type: typeNameNode.getText(),
            typePath: typeDeclarationPath,
          })
          methods.set(fileName, variables)

          // Extract singleton services for CreateWireServices factories
          if (
            expectedTypeName === 'CreateWireServices' &&
            state &&
            node.initializer
          ) {
            let functionNode:
              ts.ArrowFunction | ts.FunctionExpression | undefined
            if (ts.isArrowFunction(node.initializer)) {
              functionNode = node.initializer
            } else if (ts.isFunctionExpression(node.initializer)) {
              functionNode = node.initializer
            }

            if (functionNode) {
              const servicesMeta = extractServicesFromFunction(functionNode)
              state.wireServicesMeta.set(variableName, servicesMeta.services)
            }
          }
        }
      }
    }
  }
}
