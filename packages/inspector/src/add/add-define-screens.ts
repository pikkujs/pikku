import * as ts from 'typescript'
import { ErrorCode } from '../error-codes.js'
import type {
  InspectorState,
  InspectorLogger,
  AddonScreenMeta,
} from '../types.js'

const propName = (prop: ts.ObjectLiteralElementLike): string | undefined => {
  if (!ts.isPropertyAssignment(prop)) return undefined
  return ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
    ? prop.name.text
    : undefined
}

const stringArray = (node: ts.Expression): string[] | undefined => {
  if (!ts.isArrayLiteralExpression(node)) return undefined
  const values: string[] = []
  for (const element of node.elements) {
    if (!ts.isStringLiteral(element)) return undefined
    values.push(element.text)
  }
  return values
}

/**
 * The module specifier of `() => import('./screens/x')`. Anything else cannot
 * be handed to the host's bundler as a lazy import, so it is not read.
 */
const lazyImportSpecifier = (node: ts.Expression): string | undefined => {
  if (!ts.isArrowFunction(node)) return undefined
  const body = node.body
  if (
    !ts.isCallExpression(body) ||
    body.expression.kind !== ts.SyntaxKind.ImportKeyword
  )
    return undefined
  const [specifier] = body.arguments
  return specifier && ts.isStringLiteral(specifier) ? specifier.text : undefined
}

/**
 * Detect `defineScreens({ title, icon, screens })` and record the manifest.
 * A screen with a field that is not a literal is reported and left out: a
 * navigation entry the host cannot read would otherwise vanish with no sign.
 */
export function addDefineScreens(
  node: ts.Node,
  state: InspectorState,
  logger: InspectorLogger
) {
  if (!ts.isCallExpression(node)) return
  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'defineScreens')
    return

  const [firstArg] = args
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  const fail = (message: string) =>
    logger.critical(ErrorCode.ADDON_SCREENS_NOT_STATIC, message)

  let title: string | undefined
  let icon: string | undefined
  const screens: AddonScreenMeta[] = []

  for (const prop of firstArg.properties) {
    const key = propName(prop)
    if (!key || !ts.isPropertyAssignment(prop)) continue

    if (key === 'title' && ts.isStringLiteral(prop.initializer)) {
      title = prop.initializer.text
    } else if (key === 'icon' && ts.isStringLiteral(prop.initializer)) {
      icon = prop.initializer.text
    } else if (key === 'screens') {
      if (!ts.isArrayLiteralExpression(prop.initializer)) {
        fail(
          `defineScreens's screens must be an array literal, got: ${prop.initializer.getText()}`
        )
        continue
      }
      for (const element of prop.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) {
          fail(
            `A defineScreens screen must be an object literal, got: ${element.getText()}`
          )
          continue
        }
        let path: string | undefined
        let screenTitle: string | undefined
        let nav: boolean | undefined
        let scopes: string[] | undefined
        let component: string | undefined
        let app: string | undefined
        for (const field of element.properties) {
          const fieldKey = propName(field)
          if (!fieldKey || !ts.isPropertyAssignment(field)) continue
          const value = field.initializer
          if (fieldKey === 'path' && ts.isStringLiteral(value)) {
            path = value.text
          } else if (fieldKey === 'title' && ts.isStringLiteral(value)) {
            screenTitle = value.text
          } else if (
            fieldKey === 'nav' &&
            (value.kind === ts.SyntaxKind.TrueKeyword ||
              value.kind === ts.SyntaxKind.FalseKeyword)
          ) {
            nav = value.kind === ts.SyntaxKind.TrueKeyword
          } else if (fieldKey === 'scopes') {
            scopes = stringArray(value)
            if (!scopes) {
              fail(
                `A screen's scopes must be an array of string literals, got: ${value.getText()}`
              )
            }
          } else if (fieldKey === 'component') {
            component = lazyImportSpecifier(value)
            if (!component) {
              fail(
                `A screen's component must be () => import('<literal>'), got: ${value.getText()}`
              )
            }
          } else if (fieldKey === 'app' && ts.isStringLiteral(value)) {
            app = value.text
          }
        }
        if (!path || !screenTitle || (!component && !app)) {
          fail(
            `A defineScreens screen needs a literal path and title, and either a lazy component or an app: ${element.getText()}`
          )
          continue
        }
        if (component && app) {
          fail(
            `Screen '${path}' sets both component and app; a screen is one or the other`
          )
          continue
        }
        screens.push({
          path,
          title: screenTitle,
          ...(nav !== undefined ? { nav } : {}),
          ...(scopes ? { scopes } : {}),
          ...(component ? { component } : { app: app! }),
        } as AddonScreenMeta)
      }
    }
  }

  if (!title) {
    fail(`defineScreens needs a literal title`)
    return
  }

  logger.debug(`• Found defineScreens: ${title} (${screens.length} screens)`)
  state.screensManifest = {
    title,
    ...(icon ? { icon } : {}),
    file: node.getSourceFile().fileName,
    screens,
  }
}
