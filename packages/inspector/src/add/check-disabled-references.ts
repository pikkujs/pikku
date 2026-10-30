import * as ts from 'typescript'
import { relative } from 'node:path'
import type {
  AddWiring,
  DisabledFunctionMeta,
  InspectorLogger,
  InspectorState,
} from '../types.js'
import { ErrorCode } from '../error-codes.js'

/**
 * A function's `disabled`, read from its config: `true`, or a non-empty string
 * saying why. Anything else the build cannot read statically is refused rather
 * than taken as enabled.
 */
export const readFunctionDisabled = (
  obj: ts.ObjectLiteralExpression,
  name: string,
  logger: InspectorLogger
): { reason?: string } | null => {
  for (const prop of obj.properties) {
    if (
      !ts.isPropertyAssignment(prop) ||
      !ts.isIdentifier(prop.name) ||
      prop.name.text !== 'disabled'
    ) {
      continue
    }
    const init = prop.initializer
    if (init.kind === ts.SyntaxKind.TrueKeyword) return {}
    if (init.kind === ts.SyntaxKind.FalseKeyword) return null
    if (
      (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) &&
      init.text !== ''
    ) {
      return { reason: init.text }
    }
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `'${name}' has a \`disabled\` the build cannot read. Use \`true\` or a non-empty string literal.`
    )
    return {}
  }
  return null
}

const describe = (state: InspectorState, meta: DisabledFunctionMeta) =>
  `'${meta.name}' is disabled${meta.reason ? ` (${meta.reason})` : ''} in ${relative(state.rootDir, meta.sourceFile)}`

const position = (state: InspectorState, node: ts.Node) => {
  const sourceFile = node.getSourceFile()
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
  return `${relative(state.rootDir, sourceFile.fileName)}:${line + 1}`
}

/** The call a reference sits in, by its callee: `wireHTTP`, `rpc.invoke`. */
const enclosingCall = (node: ts.Node): string | undefined => {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isCallExpression(current) &&
      (ts.isIdentifier(current.expression) ||
        ts.isPropertyAccessExpression(current.expression))
    ) {
      return current.expression.getText()
    }
  }
  return undefined
}

/**
 * Records a function declared with `disabled`, in place of everything
 * addFunctions would otherwise record. A function defined inline in what
 * uses it is referenced by that, so it is refused instead.
 */
export const recordDisabledFunction = (
  logger: InspectorLogger,
  state: InspectorState,
  node: ts.CallExpression,
  pikkuFuncId: string,
  meta: DisabledFunctionMeta
) => {
  const parent = node.parent
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
    state.functions.disabled[pikkuFuncId] = meta
    return
  }
  const call = enclosingCall(node)
  logger.critical(
    ErrorCode.DISABLED_FUNCTION_REFERENCED,
    `A function declared \`disabled\` is defined inline at ${position(state, node)}` +
      (call ? ` inside ${call}(...)` : '') +
      `, which still uses it. Remove what uses it, or remove \`disabled\`.`
  )
}

const byLocalName = new WeakMap<
  InspectorState,
  Map<string, DisabledFunctionMeta[]>
>()

/** Disabled functions by the name code reaches them by: the export, else the name. */
const disabledByLocalName = (state: InspectorState) => {
  let index = byLocalName.get(state)
  if (index) return index
  index = new Map()
  for (const meta of Object.values(state.functions.disabled)) {
    const local = meta.exportedName ?? meta.name
    index.set(local, [...(index.get(local) ?? []), meta])
  }
  byLocalName.set(state, index)
  return index
}

/** Whether a node is inside the definition of a disabled function, whose body is dead too. */
const isInsideDisabled = (state: InspectorState, node: ts.Node): boolean => {
  const fileName = node.getSourceFile().fileName
  const index = disabledByLocalName(state)
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      index.get(current.name.text)?.some((meta) => meta.sourceFile === fileName)
    ) {
      return true
    }
  }
  return false
}

const isNotAReference = (node: ts.Identifier): boolean => {
  const parent = node.parent
  if (
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isTypeQueryNode(parent) ||
    ts.isQualifiedName(parent)
  ) {
    return true
  }
  if (ts.isShorthandPropertyAssignment(parent)) return false
  return 'name' in parent && parent.name === node
}

const resolveDeclaration = (
  node: ts.Identifier,
  checker: ts.TypeChecker
): ts.Declaration | undefined => {
  let symbol = ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node)
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol)
  }
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0]
}

/** `rpc.invoke('x')` / `rpc.mesh('x')`, seen through `!` and parentheses. */
const invokedRpcName = (node: ts.CallExpression): string | undefined => {
  const callee = node.expression
  if (
    !ts.isPropertyAccessExpression(callee) ||
    (callee.name.text !== 'invoke' && callee.name.text !== 'mesh')
  ) {
    return undefined
  }
  let receiver: ts.Expression = callee.expression
  while (
    ts.isNonNullExpression(receiver) ||
    ts.isParenthesizedExpression(receiver)
  ) {
    receiver = receiver.expression
  }
  const isRpc = ts.isIdentifier(receiver)
    ? receiver.text === 'rpc'
    : ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'rpc'
  const [first] = node.arguments
  if (
    !isRpc ||
    !first ||
    !(ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
  ) {
    return undefined
  }
  return first.text
}

/**
 * Whether a node sits in a generated file. This run rewrites those from its own
 * state, which leaves disabled functions out, so a reference there is the last
 * run's and is about to go.
 */
const isGenerated = (node: ts.Node): boolean => {
  const fileName = node.getSourceFile().fileName
  return fileName.endsWith('.gen.ts') || fileName.endsWith('.gen.js')
}

/**
 * PKU562: anything that still references a disabled function — a wiring, an
 * agent's tools, an `rpc.invoke` by name, any other code. Runs in the routes
 * sweep, after every function is registered, so it sees the whole set.
 */
export const checkDisabledReferences: AddWiring = (
  logger,
  node,
  checker,
  state
) => {
  if (Object.keys(state.functions.disabled).length === 0) return
  if (isGenerated(node)) return

  if (ts.isCallExpression(node)) {
    const invoked = invokedRpcName(node)
    if (invoked === undefined) return
    const meta = Object.values(state.functions.disabled).find(
      (m) => m.name === invoked
    )
    if (!meta || isInsideDisabled(state, node)) return
    logger.critical(
      ErrorCode.DISABLED_FUNCTION_REFERENCED,
      `${describe(state, meta)}, but ${node.expression.getText()}('${invoked}') calls it at ${position(state, node)}. ` +
        `Remove the call, or remove \`disabled\`.`
    )
    return
  }

  if (!ts.isIdentifier(node)) return
  const candidates = disabledByLocalName(state).get(node.text)
  if (!candidates || isNotAReference(node)) return
  const decl = resolveDeclaration(node, checker)
  if (!decl || !ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) {
    return
  }
  const declFile = decl.getSourceFile().fileName
  const declName = decl.name.text
  const meta = candidates.find(
    (m) => m.sourceFile === declFile && (m.exportedName ?? m.name) === declName
  )
  if (!meta || isInsideDisabled(state, node)) return
  const call = enclosingCall(node)
  logger.critical(
    ErrorCode.DISABLED_FUNCTION_REFERENCED,
    `${describe(state, meta)}, but ` +
      (call ? `${call}(...) references it` : 'it is referenced') +
      ` at ${position(state, node)}. Remove the reference, or remove \`disabled\`.`
  )
}

/** Every `rpcName` in a workflow's meta, wherever in its steps it sits. */
const collectRpcNames = (value: unknown, into: Set<string>) => {
  if (Array.isArray(value)) {
    for (const item of value) collectRpcNames(item, into)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (key === 'rpcName' && typeof child === 'string') into.add(child)
    else collectRpcNames(child, into)
  }
}

/**
 * PKU562 for workflow steps, which name the function they call as a string
 * the workflow meta already holds. Runs once, after the routes sweep.
 */
export const checkDisabledWorkflowSteps = (
  logger: InspectorLogger,
  state: InspectorState
) => {
  const disabled = Object.values(state.functions.disabled)
  if (disabled.length === 0) return
  const sections: Array<[string, Record<string, unknown>]> = [
    ['workflow', state.workflows.meta as Record<string, unknown>],
    ['workflow graph', state.workflows.graphMeta as Record<string, unknown>],
  ]
  for (const [kind, section] of sections) {
    for (const [workflowName, meta] of Object.entries(section)) {
      const names = new Set<string>()
      collectRpcNames(meta, names)
      for (const rpcName of [...names].sort()) {
        const target = disabled.find((m) => m.name === rpcName)
        if (!target) continue
        logger.critical(
          ErrorCode.DISABLED_FUNCTION_REFERENCED,
          `${describe(state, target)}, but ${kind} '${workflowName}' calls it as a step. ` +
            `Remove the step, or remove \`disabled\`.`
        )
      }
    }
  }
}
