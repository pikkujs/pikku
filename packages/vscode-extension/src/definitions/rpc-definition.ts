import * as vscode from 'vscode'
import type { PikkuInspector } from '../inspector'

/**
 * All patterns where Pikku function/workflow/agent names appear as string literals:
 *
 * RPC:       rpc.invoke('name')  rpc.remote('name')  rpc.exposed('name')
 * Agent:     rpc.agent('name')
 * Workflow:  rpc.startWorkflow('name')
 * Helpers:   workflow('name')  workflowStart('name')  workflowRun('name')  workflowStatus('name')
 * Graph:     graphStart('name', 'startNode')
 * Addon:     addon('namespace:name')
 * DSL:       workflow.do('step', 'rpcName', ...)
 */
const PATTERNS: Array<{
  regex: RegExp
  /** Which capture group holds the function name (1-indexed) */
  nameGroup: number
}> = [
  // rpc.invoke / remote / exposed / agent / startWorkflow
  {
    regex:
      /\brpc\s*\.\s*(?:invoke|remote|exposed|agent|startWorkflow)\s*\(\s*(['"])([^'"]+)\1/g,
    nameGroup: 2,
  },
  // Standalone helpers: workflow(), workflowStart(), workflowRun(), workflowStatus()
  {
    regex:
      /\b(?:workflow|workflowStart|workflowRun|workflowStatus)\s*\(\s*(['"])([^'"]+)\1/g,
    nameGroup: 2,
  },
  // graphStart('graphName', 'startNode') — first arg is the workflow name
  {
    regex: /\bgraphStart\s*\(\s*(['"])([^'"]+)\1/g,
    nameGroup: 2,
  },
  // addon('namespace:funcName')
  {
    regex: /\baddon\s*\(\s*(['"])([^'"]+)\1/g,
    nameGroup: 2,
  },
  // workflow.do('stepName', 'rpcName', ...) — second string arg is the function
  {
    regex:
      /\bworkflow\s*\.\s*do\s*\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3/g,
    nameGroup: 4,
  },
]

export class RPCDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private inspector: PikkuInspector) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    const state = this.inspector.getState()
    if (!state) return undefined

    const line = document.lineAt(position.line).text
    const name = this.getNameAtPosition(line, position.character)
    if (!name) return undefined

    return this.resolveName(name, state)
  }

  private getNameAtPosition(
    line: string,
    character: number
  ): string | undefined {
    for (const { regex, nameGroup } of PATTERNS) {
      regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = regex.exec(line)) !== null) {
        const name = match[nameGroup]
        // Walk through the match to find where this capture group starts
        const fullMatch = match[0]
        const nameIdx = fullMatch.lastIndexOf(name)
        if (nameIdx === -1) continue
        const nameStart = match.index + nameIdx
        const nameEnd = nameStart + name.length
        if (character >= nameStart && character <= nameEnd) {
          return name
        }
      }
    }
    return undefined
  }

  private resolveName(name: string, state: any): vscode.Location | undefined {
    // Handle addon namespaced names: 'namespace:funcName'
    const funcName = name.includes(':') ? name.split(':')[1] : name

    // 1. RPC internalMeta → internalFiles
    const pikkuFuncId = state.rpc?.internalMeta?.[name]
    if (pikkuFuncId) {
      const loc = this.fileToLocation(state.rpc.internalFiles?.get(pikkuFuncId))
      if (loc) return loc
    }

    // 2. RPC exposedMeta → exposedFiles
    const exposedId = state.rpc?.exposedMeta?.[name]
    if (exposedId) {
      const loc = this.fileToLocation(state.rpc.exposedFiles?.get(name))
      if (loc) return loc
    }

    // 3. Workflows meta → files
    if (state.workflows?.meta?.[name]) {
      const loc = this.fileToLocation(state.workflows.files?.get(name))
      if (loc) return loc
    }

    // 4. Workflow graph meta → graphFiles
    if (state.workflows?.graphMeta?.[name]) {
      const loc = this.fileToLocation(state.workflows.graphFiles?.get(name))
      if (loc) return loc
    }

    // 5. Agents meta → files
    if (state.agents?.agentsMeta?.[name]) {
      const loc = this.fileToLocation(state.agents.files?.get(name))
      if (loc) return loc
    }

    // 6. Direct function lookup by name or funcName (for addon namespace:func)
    for (const lookupName of [name, funcName]) {
      const fileInfo = state.functions?.files?.get(lookupName)
      if (fileInfo) {
        return this.fileToLocation(fileInfo)
      }
    }

    // 7. Search by exportedName
    for (const [, entry] of state.functions?.files?.entries() ?? []) {
      if (
        (entry as any).exportedName === name ||
        (entry as any).exportedName === funcName
      ) {
        return this.fileToLocation(entry)
      }
    }

    return undefined
  }

  private fileToLocation(
    fileInfo: { path: string } | undefined
  ): vscode.Location | undefined {
    if (!fileInfo?.path) return undefined
    return new vscode.Location(
      vscode.Uri.file(fileInfo.path),
      new vscode.Position(0, 0)
    )
  }
}
