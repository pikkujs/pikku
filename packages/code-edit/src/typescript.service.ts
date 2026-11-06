import { resolve } from 'node:path'
import { InspectorSession } from '@pikku/inspector-go'
import { resolveWorkspacePath } from './workspace-path.js'

export type TypeDiagnostic = {
  message: string
  code: number
  severity: 'error' | 'warning' | 'info'
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

const CHECKED = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

/** Type-checks workspace files with each file's own tsconfig, the way `tsc` would, including text the editor has not saved yet. */
export class TypeScriptService {
  private readonly session = new InspectorSession()

  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  /** Diagnostics for one file; `content` stands in for the file on disk when given. */
  async diagnostics(path: string, content?: string): Promise<TypeDiagnostic[]> {
    const { abs } = resolveWorkspacePath(this.root, path)
    if (!CHECKED.test(abs)) return []
    return this.session.typeDiagnostics(
      this.root,
      abs.replace(/\\/g, '/'),
      content
    )
  }

  /** Stops the type-checking process; the next call starts a new one. */
  dispose(): void {
    this.session.close()
  }
}
