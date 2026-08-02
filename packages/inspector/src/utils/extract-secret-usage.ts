import ts from 'typescript'

export type SecretUsage = {
  /** Secret ids read with a string literal, so statically known. */
  keys: string[]
  /** Reads whose key could not be resolved statically, as `line:source`. */
  dynamic: string[]
}

const SINGLE_KEY_METHODS = new Set(['getSecret', 'hasSecret'])
const KEY_LIST_METHODS = new Set(['getSecrets'])

const literalKey = (node: ts.Expression): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  return undefined
}

/** Secret reads in a file, whether the key is statically known or not. */
export const extractSecretUsage = (sourceFile: ts.SourceFile): SecretUsage => {
  const keys = new Set<string>()
  const dynamic = new Set<string>()

  const record = (node: ts.CallExpression, argument?: ts.Expression) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    dynamic.add(`${line + 1}:${(argument ?? node).getText()}`)
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const method = node.expression.name.text
      const [firstArgument] = node.arguments

      if (SINGLE_KEY_METHODS.has(method)) {
        if (!firstArgument) {
          record(node)
        } else {
          const key = literalKey(firstArgument)
          if (key === undefined) {
            record(node, firstArgument)
          } else {
            keys.add(key)
          }
        }
      } else if (KEY_LIST_METHODS.has(method)) {
        if (firstArgument && ts.isArrayLiteralExpression(firstArgument)) {
          for (const element of firstArgument.elements) {
            const key = literalKey(element)
            if (key === undefined) {
              record(node, element)
            } else {
              keys.add(key)
            }
          }
        } else {
          record(node, firstArgument)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return {
    keys: [...keys].sort(),
    dynamic: [...dynamic].sort(),
  }
}
