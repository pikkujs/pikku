import ts from 'typescript'

/**
 * Where a source file reaches around a Pikku service. Each entry is
 * `line:snippet`, in source order and without repeats.
 *
 * The two lists are the evidence for two lint policies (not for two
 * detections): `lint.enforceContentService` and `lint.enforceVariablesService`.
 */
export type ServiceBypassUsage = {
  /** Direct file storage access, bypassing the `content` service. */
  content: string[]
  /** Direct `process.env` reads, bypassing `variables` / `secrets`. */
  variables: string[]
}

/**
 * Modules whose use means "storing or reading content without the `content`
 * service". The first version flags `node:fs` only. Add object-storage SDKs
 * here to widen the policy without touching the walk below.
 */
const CONTENT_STORAGE_MODULES = new Set([
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
])

/**
 * Files the policies do not apply to: generated or scaffolded code the author
 * cannot edit (`.pikku/`, `*.gen.ts`), declaration files, and tests. The CLI
 * already drops tests through `ignoreFiles`, but the inspector also reads any
 * file the program imports, so the exemption is repeated here.
 */
export const isServiceBypassExempt = (fileName: string): boolean => {
  const normalized = fileName.replace(/\\/g, '/')
  return (
    normalized.endsWith('.gen.ts') ||
    normalized.endsWith('.d.ts') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    normalized.includes('/.pikku/')
  )
}

const isStringLike = (node: ts.Node): node is ts.StringLiteralLike =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)

const isProcessEnv = (node: ts.Node): boolean => {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process' &&
      node.name.text === 'env'
    )
  }
  return (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    isStringLike(node.argumentExpression) &&
    node.argumentExpression.text === 'env'
  )
}

/** Direct storage and environment access in a file. */
export const extractServiceBypass = (
  sourceFile: ts.SourceFile
): ServiceBypassUsage => {
  const content = new Set<string>()
  const variables = new Set<string>()

  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

  const storageModule = (node: ts.Node | undefined): string | undefined =>
    node && isStringLike(node) && CONTENT_STORAGE_MODULES.has(node.text)
      ? node.text
      : undefined

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const module = storageModule(node.moduleSpecifier)
      if (module && !node.importClause?.isTypeOnly) {
        content.add(`${lineOf(node)}:import '${module}'`)
      }
    } else if (ts.isExportDeclaration(node)) {
      const module = storageModule(node.moduleSpecifier)
      if (module && !node.isTypeOnly) {
        content.add(`${lineOf(node)}:export from '${module}'`)
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const module = storageModule(node.moduleReference.expression)
      if (module) {
        content.add(`${lineOf(node)}:require('${module}')`)
      }
    } else if (ts.isCallExpression(node)) {
      const [first] = node.arguments
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        const module = storageModule(first)
        if (module) content.add(`${lineOf(node)}:require('${module}')`)
      } else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const module = storageModule(first)
        if (module) content.add(`${lineOf(node)}:import('${module}')`)
      }
    } else if (isProcessEnv(node)) {
      const parent = node.parent
      let snippet = 'process.env'
      if (
        parent &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node
      ) {
        snippet = `process.env.${parent.name.text}`
      } else if (
        parent &&
        ts.isElementAccessExpression(parent) &&
        parent.expression === node &&
        isStringLike(parent.argumentExpression)
      ) {
        snippet = `process.env['${parent.argumentExpression.text}']`
      }
      variables.add(`${lineOf(node)}:${snippet}`)
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === 'process'
    ) {
      // `const { env } = process`, `const { env: e } = process`
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name
        if (
          !element.dotDotDotToken &&
          (ts.isIdentifier(key) || isStringLike(key)) &&
          key.text === 'env'
        ) {
          variables.add(`${lineOf(node)}:const { env } = process`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return { content: [...content], variables: [...variables] }
}
