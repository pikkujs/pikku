import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'
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

const INFERRED: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
}

type Project = {
  fileNames: Set<string>
  service: ts.LanguageService
}

/** Type-checks workspace files with each file's own tsconfig, the way `tsc` would, including text the editor has not saved yet. */
export class TypeScriptService {
  private readonly projects = new Map<string, Project>()
  private overlay: { file: string; text: string; version: number } | null = null

  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  /** Diagnostics for one file; `content` stands in for the file on disk when given. */
  diagnostics(path: string, content?: string): TypeDiagnostic[] {
    const { abs } = resolveWorkspacePath(this.root, path)
    if (!CHECKED.test(abs)) return []
    const file = abs.replace(/\\/g, '/')
    if (content !== undefined) {
      if (this.overlay?.file !== file || this.overlay.text !== content)
        this.overlay = {
          file,
          text: content,
          version: (this.overlay?.version ?? 0) + 1,
        }
    } else if (this.overlay?.file === file) this.overlay = null
    const { service } = this.projectFor(file)
    const program = service.getProgram()
    if (!program?.getSourceFile(file)) return []
    return [
      ...service.getSyntacticDiagnostics(file),
      ...service.getSemanticDiagnostics(file),
    ].map((d) => this.toDiagnostic(d))
  }

  private toDiagnostic(d: ts.Diagnostic): TypeDiagnostic {
    const start = d.file?.getLineAndCharacterOfPosition(d.start ?? 0) ?? {
      line: 0,
      character: 0,
    }
    const end =
      d.file?.getLineAndCharacterOfPosition((d.start ?? 0) + (d.length ?? 0)) ??
      start
    return {
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      code: d.code,
      severity:
        d.category === ts.DiagnosticCategory.Error
          ? 'error'
          : d.category === ts.DiagnosticCategory.Warning
            ? 'warning'
            : 'info',
      startLine: start.line + 1,
      startColumn: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    }
  }

  private projectFor(file: string): Project {
    const configPath = this.configFor(file)
    const key = configPath ?? `inferred:${dirname(file)}`
    let project = this.projects.get(key)
    if (!project || (!configPath && !project.fileNames.has(file))) {
      project = this.createProject(configPath, file)
      this.projects.set(key, project)
    }
    return project
  }

  /** The nearest tsconfig, walking up and through project references, whose program includes the file. */
  private configFor(file: string): string | undefined {
    let dir = dirname(file)
    while (dir.startsWith(this.root)) {
      const found = ts.findConfigFile(dir, ts.sys.fileExists)
      if (!found || !found.startsWith(this.root)) return undefined
      const match = this.includes(resolve(found), file, new Set())
      if (match) return match
      const parent = dirname(dirname(found))
      if (parent === dir) return undefined
      dir = parent
    }
    return undefined
  }

  private includes(
    configPath: string,
    file: string,
    seen: Set<string>
  ): string | undefined {
    if (seen.has(configPath)) return undefined
    seen.add(configPath)
    const parsed = this.parse(configPath)
    if (!parsed) return undefined
    if (parsed.fileNames.some((f) => resolve(f) === resolve(file)))
      return configPath
    for (const ref of parsed.projectReferences ?? []) {
      const match = this.includes(
        ts.resolveProjectReferencePath(ref),
        file,
        seen
      )
      if (match) return match
    }
    return undefined
  }

  private parse(configPath: string): ts.ParsedCommandLine | undefined {
    return ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
    )
  }

  private createProject(configPath: string | undefined, file: string): Project {
    const parsed = configPath ? this.parse(configPath) : undefined
    const options = { ...(parsed?.options ?? INFERRED), noEmit: true }
    const fileNames = new Set(
      (parsed?.fileNames ?? [file]).map((f) => resolve(f).replace(/\\/g, '/'))
    )
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => options,
      getProjectReferences: () => parsed?.projectReferences,
      getScriptFileNames: () => [...fileNames],
      getScriptVersion: (name) =>
        this.overlay?.file === name
          ? `o${this.overlay.version}`
          : String(statSync(name, { throwIfNoEntry: false })?.mtimeMs ?? 0),
      getScriptSnapshot: (name) => {
        const text =
          this.overlay?.file === name
            ? this.overlay.text
            : ts.sys.readFile(name)
        return text === undefined
          ? undefined
          : ts.ScriptSnapshot.fromString(text)
      },
      getCurrentDirectory: () => (configPath ? dirname(configPath) : this.root),
      getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
      fileExists: (name) =>
        this.overlay?.file === name || ts.sys.fileExists(name),
      readFile: (name) =>
        this.overlay?.file === name ? this.overlay.text : ts.sys.readFile(name),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
    }
    return {
      fileNames,
      service: ts.createLanguageService(host, ts.createDocumentRegistry()),
    }
  }
}
