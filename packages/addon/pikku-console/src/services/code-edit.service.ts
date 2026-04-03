import * as ts from 'typescript'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

export interface FunctionConfigChanges {
  title?: string | null
  description?: string | null
  summary?: string | null
  tags?: string[] | null
  errors?: string[] | null
  expose?: boolean | null
  remote?: boolean | null
  mcp?: boolean | null
  readonly?: boolean | null
  approvalRequired?: boolean | null
}

export interface AgentConfigChanges {
  name?: string
  description?: string | null
  role?: string | null
  personality?: string | null
  goal?: string | null
  model?: string
  maxSteps?: number | null
  temperature?: number | null
  toolChoice?: 'auto' | 'required' | 'none' | null
  tools?: string[] | null
}

interface PropertyLocation {
  name: string
  valueStart: number
  valueEnd: number
  propStart: number
  propEnd: number
}

interface PikkuCallInfo {
  objectLiteral: ts.ObjectLiteralExpression
  wrapperName: string
  properties: PropertyLocation[]
  funcProperty?: {
    valueStart: number
    valueEnd: number
  }
}

export class CodeEditService {
  constructor(private rootDir: string) {}

  async readFunctionSource(
    sourceFile: string,
    exportedName: string
  ): Promise<{
    config: Record<string, unknown>
    body: string | null
    wrapperName: string
  }> {
    const absPath = this.resolvePath(sourceFile)
    const content = await readFile(absPath, 'utf-8')
    const callInfo = this.findPikkuCall(content, exportedName)

    const config: Record<string, unknown> = {}
    for (const prop of callInfo.properties) {
      if (prop.name === 'func') continue
      config[prop.name] = this.parsePropertyValue(
        content.slice(prop.valueStart, prop.valueEnd)
      )
    }

    let body: string | null = null
    if (callInfo.funcProperty) {
      body = content.slice(
        callInfo.funcProperty.valueStart,
        callInfo.funcProperty.valueEnd
      )
    }

    return { config, body, wrapperName: callInfo.wrapperName }
  }

  async readFunctionBody(
    sourceFile: string,
    exportedName: string
  ): Promise<string> {
    const absPath = this.resolvePath(sourceFile)
    const content = await readFile(absPath, 'utf-8')
    const callInfo = this.findPikkuCall(content, exportedName)

    if (!callInfo.funcProperty) {
      throw new Error(
        `No 'func' property found in ${exportedName} in ${sourceFile}`
      )
    }

    return content.slice(
      callInfo.funcProperty.valueStart,
      callInfo.funcProperty.valueEnd
    )
  }

  async updateFunctionConfig(
    sourceFile: string,
    exportedName: string,
    changes: FunctionConfigChanges
  ): Promise<void> {
    const absPath = this.resolvePath(sourceFile)
    const content = await readFile(absPath, 'utf-8')
    const callInfo = this.findPikkuCall(content, exportedName)

    const result = this.applyPropertyChanges(
      content,
      callInfo,
      changes as Record<string, unknown>
    )
    await writeFile(absPath, result, 'utf-8')
  }

  async updateFunctionBody(
    sourceFile: string,
    exportedName: string,
    newBody: string
  ): Promise<void> {
    const absPath = this.resolvePath(sourceFile)
    const content = await readFile(absPath, 'utf-8')
    const callInfo = this.findPikkuCall(content, exportedName)

    if (!callInfo.funcProperty) {
      throw new Error(
        `No 'func' property found in ${exportedName} in ${sourceFile}`
      )
    }

    const result =
      content.slice(0, callInfo.funcProperty.valueStart) +
      newBody +
      content.slice(callInfo.funcProperty.valueEnd)
    await writeFile(absPath, result, 'utf-8')
  }

  async readAgentSource(
    sourceFile: string,
    exportedName: string
  ): Promise<{ config: Record<string, unknown> }> {
    const absPath = this.resolvePath(sourceFile)
    const content = await readFile(absPath, 'utf-8')
    const callInfo = this.findPikkuCall(content, exportedName)

    const config: Record<string, unknown> = {}
    for (const prop of callInfo.properties) {
      config[prop.name] = this.parsePropertyValue(
        content.slice(prop.valueStart, prop.valueEnd)
      )
    }

    return { config }
  }

  async updateAgentConfig(
    sourceFile: string,
    exportedName: string,
    changes: AgentConfigChanges
  ): Promise<void> {
    const absPath = this.resolvePath(sourceFile)
    const content = await readFile(absPath, 'utf-8')
    const callInfo = this.findPikkuCall(content, exportedName)

    const result = this.applyPropertyChanges(
      content,
      callInfo,
      changes as Record<string, unknown>
    )
    await writeFile(absPath, result, 'utf-8')
  }

  private resolvePath(sourceFile: string): string {
    if (sourceFile.startsWith('/')) return sourceFile
    return resolve(this.rootDir, sourceFile)
  }

  private findPikkuCall(content: string, exportedName: string): PikkuCallInfo {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )

    let result: PikkuCallInfo | null = null

    const visit = (node: ts.Node) => {
      if (result) return

      if (
        ts.isVariableStatement(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isExportAssignment(node)
      ) {
        // Find the variable declaration matching exportedName
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (
              ts.isIdentifier(decl.name) &&
              decl.name.text === exportedName &&
              decl.initializer
            ) {
              result = this.extractCallInfo(decl.initializer, content)
              return
            }
          }
        } else if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === exportedName &&
          node.initializer
        ) {
          result = this.extractCallInfo(node.initializer, content)
          return
        }
      }

      ts.forEachChild(node, visit)
    }

    ts.forEachChild(sourceFile, visit)

    if (!result) {
      throw new Error(
        `Could not find exported variable '${exportedName}' with a pikku call`
      )
    }

    return result
  }

  private extractCallInfo(
    node: ts.Node,
    content: string
  ): PikkuCallInfo | null {
    if (!ts.isCallExpression(node)) return null
    if (!ts.isIdentifier(node.expression)) return null

    const wrapperName = node.expression.text
    if (!wrapperName.startsWith('pikku')) return null

    const firstArg = node.arguments[0]
    if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return null

    const properties: PropertyLocation[] = []
    let funcProperty: PikkuCallInfo['funcProperty'] = undefined

    for (const prop of firstArg.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      if (!ts.isIdentifier(prop.name)) continue

      const name = prop.name.text
      const valueStart = prop.initializer.getStart()
      const valueEnd = prop.initializer.getEnd()
      const propStart = prop.getStart()
      const propEnd = prop.getEnd()

      if (name === 'func') {
        funcProperty = { valueStart, valueEnd }
      }

      properties.push({ name, valueStart, valueEnd, propStart, propEnd })
    }

    return {
      objectLiteral: firstArg,
      wrapperName,
      properties,
      funcProperty,
    }
  }

  private applyPropertyChanges(
    content: string,
    callInfo: PikkuCallInfo,
    changes: Record<string, unknown>
  ): string {
    // Sort changes into updates, removals, and additions
    const updates: Array<{ prop: PropertyLocation; newValue: string }> = []
    const removals: PropertyLocation[] = []
    const additions: Array<{ name: string; value: string }> = []

    for (const [key, value] of Object.entries(changes)) {
      if (key === 'func') continue

      const existing = callInfo.properties.find((p) => p.name === key)

      const serialized =
        key === 'tools' && Array.isArray(value)
          ? this.serializeToolsArray(value)
          : this.serializeValue(value)

      if (value === null || value === undefined) {
        if (existing) {
          removals.push(existing)
        }
      } else if (existing) {
        updates.push({ prop: existing, newValue: serialized })
      } else {
        additions.push({ name: key, value: serialized })
      }
    }

    // Apply changes in reverse order (by position) to preserve offsets
    const edits: Array<{ start: number; end: number; replacement: string }> = []

    for (const { prop, newValue } of updates) {
      edits.push({
        start: prop.valueStart,
        end: prop.valueEnd,
        replacement: newValue,
      })
    }

    for (const prop of removals) {
      let removeEnd = prop.propEnd
      const afterProp = content.slice(removeEnd, removeEnd + 20)
      const commaMatch = afterProp.match(/^\s*,/)
      if (commaMatch) {
        removeEnd += commaMatch[0].length
      }
      let removeStart = prop.propStart
      const beforeProp = content.slice(
        Math.max(0, removeStart - 100),
        removeStart
      )
      const nlMatch = beforeProp.match(/\n[ \t]*$/)
      if (nlMatch) {
        removeStart -= nlMatch[0].length
      }
      edits.push({ start: removeStart, end: removeEnd, replacement: '' })
    }

    if (additions.length > 0) {
      const objEnd = callInfo.objectLiteral.getEnd() - 1
      const indent = this.detectIndent(content, callInfo)
      const newProps = additions
        .map(({ name, value }) => `${indent}${name}: ${value},`)
        .join('\n')

      const lastProp = callInfo.properties[callInfo.properties.length - 1]
      const hasTrailingComma = lastProp
        ? /,\s*$/.test(content.slice(lastProp.propEnd, objEnd).trim() || ',')
        : false

      let insertion = ''
      if (lastProp && !hasTrailingComma) {
        insertion = `,\n${newProps}\n`
      } else {
        insertion = `\n${newProps}\n`
      }

      edits.push({ start: objEnd, end: objEnd, replacement: insertion })
    }

    edits.sort((a, b) => b.start - a.start)

    let result = content
    for (const edit of edits) {
      result =
        result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
    }

    return result
  }

  private detectIndent(content: string, callInfo: PikkuCallInfo): string {
    if (callInfo.properties.length > 0) {
      const firstProp = callInfo.properties[0]!
      const lineStart = content.lastIndexOf('\n', firstProp.propStart)
      if (lineStart >= 0) {
        const lineContent = content.slice(lineStart + 1, firstProp.propStart)
        const match = lineContent.match(/^(\s+)/)
        if (match) return match[1]!
      }
    }
    return '  '
  }

  private serializeToolsArray(tools: string[]): string {
    if (tools.length === 0) return '[]'
    const items = tools.map((t) => (t.includes(':') ? `addon('${t}')` : t))
    return `[${items.join(', ')}]`
  }

  private serializeValue(value: unknown): string {
    if (typeof value === 'string') {
      // Use single quotes for simple strings, template literals for multi-line
      if (value.includes('\n')) {
        return '`' + value.replace(/`/g, '\\`').replace(/\$/g, '\\$') + '`'
      }
      return `'${value.replace(/'/g, "\\'")}'`
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]'
      const items = value.map((v) => this.serializeValue(v))
      return `[${items.join(', ')}]`
    }
    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value)
        .map(([k, v]) => `${k}: ${this.serializeValue(v)}`)
        .join(', ')
      return `{ ${entries} }`
    }
    return String(value)
  }

  private parsePropertyValue(raw: string): unknown {
    const trimmed = raw.trim()
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    if (trimmed === 'null') return null
    if (trimmed === 'undefined') return undefined
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
    // String literals
    if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith('`') && trimmed.endsWith('`'))
    ) {
      return trimmed.slice(1, -1)
    }
    // Arrays — return raw text for complex values
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed.replace(/'/g, '"'))
      } catch {
        return trimmed
      }
    }
    // Return raw text for anything else (identifiers, function refs, etc.)
    return trimmed
  }
}
