import * as ts from 'typescript'
import { parseRemoteAddonPackage } from './remote-addon-sdk.js'

/** A `wireRemoteAddon({ package })` found in source, with the line its literal sits on. */
export type WireRemoteAddonSpec = {
  /** The `name` option, when it is a literal. */
  namespace?: string
  /** The literal as written, e.g. `@scope/name@^1.4.0`. */
  spec: string
  name: string
  range?: string
  /** 1-based line of the literal. */
  line: number
}

/**
 * Every `wireRemoteAddon({ package: '<literal>' })` in one file. A `package`
 * that is not a literal, or that does not parse, is skipped: the inspection
 * reports those.
 */
export const findWireRemoteAddonSpecs = (
  fileName: string,
  sourceText: string
): WireRemoteAddonSpec[] => {
  if (!sourceText.includes('wireRemoteAddon')) return []
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  )
  const found: WireRemoteAddonSpec[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'wireRemoteAddon' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      let namespace: string | undefined
      let literal: ts.StringLiteralLike | undefined
      for (const prop of node.arguments[0].properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name))
          continue
        if (
          prop.name.text === 'name' &&
          ts.isStringLiteralLike(prop.initializer)
        ) {
          namespace = prop.initializer.text
        } else if (
          prop.name.text === 'package' &&
          ts.isStringLiteralLike(prop.initializer)
        ) {
          literal = prop.initializer
        }
      }
      if (literal) {
        try {
          const { name, range } = parseRemoteAddonPackage(literal.text)
          found.push({
            namespace,
            spec: literal.text,
            name,
            range,
            line:
              sourceFile.getLineAndCharacterOfPosition(
                literal.getStart(sourceFile)
              ).line + 1,
          })
        } catch {
          // reported by the inspection
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}
