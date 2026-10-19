import * as ts from 'typescript'
import { ErrorCode } from '../error-codes.js'
import type {
  ContributorRef,
  ContributorVariantsMeta,
  InspectorLogger,
  InspectorState,
} from '../types.js'
import { callsImportedDefiner, exportedName } from './add-analytics.js'

const DEFINE_CONTRIBUTORS = 'defineContributors'
const VARIANTS = ['dev', 'deploy'] as const

const propertyKey = (name: ts.PropertyName): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined

/**
 * Where an exported contributor const lives and what it is exported as. A
 * host imports exactly this, so a variant that is inline, not exported, or
 * built by a call has no answer and is reported instead.
 */
const resolveVariant = (
  value: ts.Expression,
  checker: ts.TypeChecker
): ContributorRef | string => {
  if (!ts.isIdentifier(value)) {
    return `must be a reference to an exported const so a host can import just that variant, got: ${value.getText()}`
  }
  let symbol = checker.getSymbolAtLocation(value)
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol)
  }
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0]
  if (
    !declaration ||
    !ts.isVariableDeclaration(declaration) ||
    !ts.isIdentifier(declaration.name)
  ) {
    return `'${value.text}' does not resolve to a const declaration`
  }
  const exported = exportedName(declaration, declaration.name, checker)
  if (!exported) {
    return `'${value.text}' is not exported by ${declaration.getSourceFile().fileName}`
  }
  return { module: declaration.getSourceFile().fileName, export: exported }
}

/**
 * Detect `defineContributors({ [name]: { dev?, deploy? } })` and record, per
 * name, the module and export of each variant. A name defined twice, or a
 * variant a host could not import by itself, is a critical error: a contributor
 * that silently drops out would leave the host without the service it opted in
 * to.
 */
export function addDefineContributors(
  logger: InspectorLogger,
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState
) {
  if (!ts.isCallExpression(node)) return
  if (!callsImportedDefiner(node.expression, checker, DEFINE_CONTRIBUTORS))
    return

  const fail = (code: ErrorCode, message: string) =>
    logger.critical(code, message)
  const notStatic = (message: string) =>
    fail(ErrorCode.CONTRIBUTORS_NOT_STATIC, message)

  const [argument] = node.arguments
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    notStatic(
      `defineContributors must be called with an object literal keyed by contributor name${argument ? `, got: ${argument.getText()}` : ''}`
    )
    return
  }

  for (const property of argument.properties) {
    const name = ts.isPropertyAssignment(property)
      ? propertyKey(property.name)
      : undefined
    if (!name || !ts.isPropertyAssignment(property)) {
      notStatic(
        `defineContributors takes { name: { dev?, deploy? } } entries, got: ${property.getText()}`
      )
      continue
    }
    if (!ts.isObjectLiteralExpression(property.initializer)) {
      notStatic(
        `Contributor '${name}' must be an object literal with dev and/or deploy, got: ${property.initializer.getText()}`
      )
      continue
    }

    const variants: ContributorVariantsMeta = {}
    let valid = true
    for (const variant of property.initializer.properties) {
      const key = ts.isPropertyAssignment(variant)
        ? propertyKey(variant.name)
        : undefined
      if (
        !key ||
        !ts.isPropertyAssignment(variant) ||
        !(VARIANTS as readonly string[]).includes(key)
      ) {
        notStatic(
          `Contributor '${name}' takes only dev and deploy, got: ${variant.getText()}`
        )
        valid = false
        continue
      }
      const ref = resolveVariant(variant.initializer, checker)
      if (typeof ref === 'string') {
        notStatic(`Contributor '${name}' ${key} ${ref}`)
        valid = false
        continue
      }
      variants[key as (typeof VARIANTS)[number]] = ref
    }
    if (!valid) continue
    if (!variants.dev && !variants.deploy) {
      notStatic(`Contributor '${name}' declares neither dev nor deploy`)
      continue
    }

    const manifest = (state.contributorsManifest ??= {})
    if (manifest[name]) {
      fail(
        ErrorCode.CONTRIBUTOR_NAME_DUPLICATED,
        `Contributor '${name}' is defined twice. A contributor name belongs to one defineContributors entry.`
      )
      continue
    }
    logger.debug(`• Found ${DEFINE_CONTRIBUTORS}: ${name}`)
    manifest[name] = variants
  }
}
