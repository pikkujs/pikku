import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import {
  MIDDLEWARE_HELPERS,
  PERMISSION_HELPERS,
  calleeNames,
  isNamespaceReceiver,
} from '../utils/resolve-callee-name.js'

const isGateHelper = (name: string) =>
  MIDDLEWARE_HELPERS.has(name) || PERMISSION_HELPERS.has(name)

const localNamesCache = new WeakMap<ts.SourceFile, ReadonlySet<string>>()

/** The names a file can reach a gate helper by: its own, and its import aliases. */
const localGateNames = (sourceFile: ts.SourceFile): ReadonlySet<string> => {
  const cached = localNamesCache.get(sourceFile)
  if (cached) return cached
  const names = new Set<string>([...MIDDLEWARE_HELPERS, ...PERMISSION_HELPERS])
  for (const statement of sourceFile.statements) {
    const bindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : undefined
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if (isGateHelper((element.propertyName ?? element.name).text)) {
        names.add(element.name.text)
      }
    }
  }
  localNamesCache.set(sourceFile, names)
  return names
}

/**
 * Whether a reference to a gate helper sits where the inspector already
 * accounts for it: called directly, imported or re-exported, bound to another
 * `const` name, named as a declaration, or used as a type.
 */
const isAccountedFor = (reference: ts.Expression): boolean => {
  const parent = reference.parent
  if (ts.isCallExpression(parent) && parent.expression === reference) {
    return true
  }
  if (
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isExportAssignment(parent) ||
    ts.isQualifiedName(parent) ||
    ts.isTypeNode(parent) ||
    ts.isExpressionWithTypeArguments(parent)
  ) {
    return true
  }
  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === reference &&
    ts.getCombinedNodeFlags(parent) & ts.NodeFlags.Const
  ) {
    return true
  }
  if ('name' in parent && parent.name === reference) {
    return true
  }
  for (let current = parent; current; current = current.parent) {
    if (
      (ts.isVariableDeclaration(current) ||
        ts.isFunctionDeclaration(current)) &&
      current.name &&
      ts.isIdentifier(current.name) &&
      isGateHelper(current.name.text)
    ) {
      return true
    }
  }
  return false
}

/**
 * A middleware or permission helper the inspector can only see by its direct
 * calls. Passed around as a value — into an array, through a ternary, as an
 * argument — whatever it registers is invisible to codegen, and a gate that
 * codegen never imports is a gate that never runs. Say so rather than
 * generate an app that is silently open.
 */
export const checkIndirectRegistrations: AddWiring = (
  logger,
  node,
  checker
) => {
  if (!ts.isIdentifier(node)) return
  const sourceFile = node.getSourceFile()
  if (sourceFile.isDeclarationFile) return
  if (!localGateNames(sourceFile).has(node.text)) return

  let reference: ts.Expression = node
  if (ts.isPropertyAccessExpression(node.parent)) {
    if (node.parent.name !== node) return
    if (!isNamespaceReceiver(node.parent.expression, checker)) return
    reference = node.parent
  }
  if (isAccountedFor(reference)) return

  const helper = [...calleeNames(reference, checker)]
    .reverse()
    .find(isGateHelper)
  if (!helper) return

  const symbol = checker.getSymbolAtLocation(node)
  if (symbol?.valueDeclaration && ts.isParameter(symbol.valueDeclaration)) {
    return
  }
  const type = checker.getTypeAtLocation(reference)
  if (
    type.getCallSignatures().length === 0 &&
    !(type.flags & ts.TypeFlags.Any)
  ) {
    return
  }

  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
  logger.diagnostic({
    severity: 'error',
    code: ErrorCode.REGISTRATION_NOT_A_DIRECT_CALL,
    message:
      `'${reference.getText()}' (${helper}) is used as a value at ${sourceFile.fileName}:${line + 1}. ` +
      `The inspector records middleware and permissions only where ${helper} is called directly, ` +
      `so whatever this registers is never imported by the generated code and does not run. ` +
      `Call ${helper}(...) directly.`,
  })
}
