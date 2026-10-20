import * as ts from 'typescript'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { ErrorCode } from '../error-codes.js'
import type {
  InspectorState,
  InspectorLogger,
  StudioNavMeta,
  StudioScreenMeta,
} from '../types.js'

const SCOPES = ['studio', 'team', 'project'] as const
const NAV_AREAS = ['rail', 'team', 'project', 'account'] as const

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

const booleanLiteral = (node: ts.Expression): boolean | undefined =>
  node.kind === ts.SyntaxKind.TrueKeyword
    ? true
    : node.kind === ts.SyntaxKind.FalseKeyword
      ? false
      : undefined

const oneOf = <T extends string>(
  node: ts.Expression,
  values: readonly T[]
): T | undefined =>
  ts.isStringLiteral(node) && (values as readonly string[]).includes(node.text)
    ? (node.text as T)
    : undefined

const numberLiteral = (node: ts.Expression): number | undefined => {
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  )
    return -Number(node.operand.text)
  return undefined
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

const readNav = (
  node: ts.Expression,
  fail: (message: string) => void
): StudioNavMeta | undefined => {
  if (!ts.isObjectLiteralExpression(node)) {
    fail(`A screen's nav must be an object literal, got: ${node.getText()}`)
    return undefined
  }
  let area: StudioNavMeta['area'] | undefined
  let icon: string | undefined
  let order: number | undefined
  let badge: string | undefined
  let ok = true
  for (const field of node.properties) {
    const key = propName(field)
    if (!key || !ts.isPropertyAssignment(field)) {
      fail(`A screen's nav field must be a literal, got: ${field.getText()}`)
      ok = false
      continue
    }
    const value = field.initializer
    let read: unknown
    if (key === 'area') read = area = oneOf(value, NAV_AREAS)
    else if (key === 'icon')
      read = icon = ts.isStringLiteral(value) ? value.text : undefined
    else if (key === 'order') read = order = numberLiteral(value)
    else if (key === 'badge')
      read = badge = ts.isStringLiteral(value) ? value.text : undefined
    else continue
    if (read === undefined) {
      fail(
        `A screen's nav ${key} must be ${key === 'area' ? `one of ${NAV_AREAS.map((a) => `'${a}'`).join(', ')}` : 'a literal'}, got: ${value.getText()}`
      )
      ok = false
    }
  }
  if (!ok) return undefined
  if (!area || icon === undefined || order === undefined) {
    fail(
      `A screen's nav needs a literal area, icon and order: ${node.getText()}`
    )
    return undefined
  }
  return { area, icon, order, ...(badge !== undefined ? { badge } : {}) }
}

const readScreen = (
  element: ts.Expression,
  fail: (message: string) => void
): StudioScreenMeta | undefined => {
  if (!ts.isObjectLiteralExpression(element)) {
    fail(
      `A pikkuStudio screen must be an object literal, got: ${element.getText()}`
    )
    return undefined
  }
  let path: string | undefined
  let title: string | undefined
  let scope: StudioScreenMeta['scope'] | undefined
  let nav: StudioNavMeta | undefined
  let replaces: boolean | undefined
  let needsApp: boolean | undefined
  let layout: 'bare' | undefined
  let scopes: string[] | undefined
  let component: string | undefined
  let app: string | undefined
  let ok = true
  for (const field of element.properties) {
    const key = propName(field)
    if (!key || !ts.isPropertyAssignment(field)) {
      fail(`A screen's field must be a literal, got: ${field.getText()}`)
      ok = false
      continue
    }
    const value = field.initializer
    let read: unknown
    if (key === 'path')
      read = path = ts.isStringLiteral(value) ? value.text : undefined
    else if (key === 'title')
      read = title = ts.isStringLiteral(value) ? value.text : undefined
    else if (key === 'scope') read = scope = oneOf(value, SCOPES)
    else if (key === 'nav') {
      nav = readNav(value, fail)
      if (!nav) ok = false
      continue
    } else if (key === 'replaces') read = replaces = booleanLiteral(value)
    else if (key === 'needsApp') read = needsApp = booleanLiteral(value)
    else if (key === 'layout') read = layout = oneOf(value, ['bare'] as const)
    else if (key === 'scopes') {
      read = scopes = stringArray(value)
      if (!scopes) {
        fail(
          `A screen's scopes must be an array of string literals, got: ${value.getText()}`
        )
        ok = false
        continue
      }
    } else if (key === 'component') {
      read = component = lazyImportSpecifier(value)
      if (!component) {
        fail(
          `A screen's component must be () => import('<literal>'), got: ${value.getText()}`
        )
        ok = false
        continue
      }
    } else if (key === 'app')
      read = app = ts.isStringLiteral(value) ? value.text : undefined
    else continue
    if (read === undefined) {
      fail(
        `A screen's ${key} must be ${key === 'scope' ? `one of ${SCOPES.map((a) => `'${a}'`).join(', ')}` : key === 'layout' ? `'bare'` : 'a literal'}, got: ${value.getText()}`
      )
      ok = false
    }
  }
  if (!ok) return undefined
  if (!path || !title || !scope || (!component && !app)) {
    fail(
      `A pikkuStudio screen needs a literal path, title and scope, and either a lazy component or an app: ${element.getText()}`
    )
    return undefined
  }
  if (component && app) {
    fail(
      `Screen '${path}' sets both component and app; a screen is one or the other`
    )
    return undefined
  }
  return {
    path,
    title,
    scope,
    ...(nav ? { nav } : {}),
    ...(replaces !== undefined ? { replaces } : {}),
    ...(needsApp !== undefined ? { needsApp } : {}),
    ...(layout ? { layout } : {}),
    ...(scopes ? { scopes } : {}),
    ...(component ? { component } : { app: app! }),
  } as StudioScreenMeta
}

/**
 * Detect `pikkuStudio({ title, screens })` and record it as the package's
 * `studio` metadata. Every field must be a literal: one that is not is
 * reported and its screen left out, since a screen the host cannot read would
 * otherwise vanish with no sign.
 */
export function addPikkuStudio(
  node: ts.Node,
  state: InspectorState,
  logger: InspectorLogger
) {
  if (!ts.isCallExpression(node)) return
  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuStudio') return

  const [firstArg] = args
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  const fail = (message: string) =>
    logger.critical(ErrorCode.ADDON_SCREENS_NOT_STATIC, message)

  let title: string | undefined
  const screens: StudioScreenMeta[] = []

  for (const prop of firstArg.properties) {
    const key = propName(prop)
    if (!key || !ts.isPropertyAssignment(prop)) {
      fail(`A pikkuStudio field must be a literal, got: ${prop.getText()}`)
      continue
    }

    if (key === 'title') {
      if (ts.isStringLiteral(prop.initializer)) {
        title = prop.initializer.text
      } else {
        fail(
          `pikkuStudio's title must be a literal, got: ${prop.initializer.getText()}`
        )
      }
    } else if (key === 'screens') {
      if (!ts.isArrayLiteralExpression(prop.initializer)) {
        fail(
          `pikkuStudio's screens must be an array literal, got: ${prop.initializer.getText()}`
        )
        continue
      }
      for (const element of prop.initializer.elements) {
        const screen = readScreen(element, fail)
        if (screen) screens.push(screen)
      }
    }
  }

  if (!title) {
    fail(`pikkuStudio needs a literal title`)
    return
  }

  const seen = new Set<string>()
  for (const screen of screens) {
    if (seen.has(screen.path)) {
      logger.critical(
        ErrorCode.STUDIO_SCREEN_PATH_DUPLICATE,
        `pikkuStudio declares two screens at '${screen.path}'; each screen needs its own path`
      )
    }
    seen.add(screen.path)
  }

  logger.debug(`• Found pikkuStudio: ${title} (${screens.length} screens)`)
  state.studio = {
    title,
    file: node.getSourceFile().fileName,
    screens,
  }
}

/** The directory of the nearest package.json above the file: the addon package root. */
const packageRoot = (file: string): string | undefined => {
  let dir = dirname(file)
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

const readCatalog = (file: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return undefined
  }
}

/**
 * The checks on `pikkuStudio` that need the whole package: every title is a
 * key in the addon's `messages/en.json` (a key missing from another locale is
 * a warning), and every nav badge names one of the addon's functions.
 */
export function validatePikkuStudio(
  logger: InspectorLogger,
  state: InspectorState
) {
  const studio = state.studio
  if (!studio) return

  const keys = [studio.title, ...studio.screens.map((screen) => screen.title)]
  const root = packageRoot(studio.file)
  const messagesDir = root ? join(root, 'messages') : undefined
  const en = messagesDir ? readCatalog(join(messagesDir, 'en.json')) : undefined
  for (const key of new Set(keys)) {
    if (!en || !Object.hasOwn(en, key)) {
      logger.critical(
        ErrorCode.STUDIO_MESSAGE_KEY_MISSING,
        `pikkuStudio uses the message key '${key}', which is missing from the addon's messages/en.json`
      )
    }
  }
  if (messagesDir && existsSync(messagesDir)) {
    const locales = readdirSync(messagesDir)
      .filter((name) => name.endsWith('.json') && name !== 'en.json')
      .sort()
    for (const name of locales) {
      const catalog = readCatalog(join(messagesDir, name)) ?? {}
      for (const key of new Set(keys)) {
        if (!Object.hasOwn(catalog, key)) {
          logger.warn(
            `pikkuStudio uses the message key '${key}', which is missing from the addon's messages/${name}`
          )
        }
      }
    }
  }

  for (const screen of studio.screens) {
    const badge = screen.nav?.badge
    if (badge !== undefined && !state.functions.meta[badge]) {
      logger.critical(
        ErrorCode.STUDIO_BADGE_FUNCTION_NOT_FOUND,
        `Screen '${screen.path}' has the nav badge '${badge}', which names no function in this addon`
      )
    }
  }
}
