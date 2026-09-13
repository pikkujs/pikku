/**
 * Can a string become a tree without touching disk? `collectErrorStatuses`
 * parses an emitted `.js` sibling with `ts.createSourceFile`, which 7 has no
 * equivalent of. The route is a source file held only in the client-side
 * filesystem, added to the project's file list.
 */
import { API } from '@typescript/native/unstable/sync'
import {
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
} from '@typescript/native/unstable/ast/is'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'pikku-ts7-'))
const config = join(root, 'tsconfig.json')
const emitted = join(root, 'errors.js')

const files: Record<string, string> = {
  [config]: JSON.stringify({
    compilerOptions: { allowJs: true, checkJs: false, skipLibCheck: true },
    files: [emitted],
  }),
  [emitted]: `addError(NotFoundError, { status: 404 })\naddError(TeapotError, { status: 418 })\n`,
}

const api = new API({
  cwd: root,
  fs: {
    readFile: (name) => files[name],
    fileExists: (name) => (name in files ? true : undefined),
    directoryExists: () => undefined,
    getAccessibleEntries: () => undefined,
    realpath: () => undefined,
  },
})

const project = api.updateSnapshot({ openProjects: [config] }).getProject(config)
const sourceFile = project?.program.getSourceFile(emitted)
console.log('source file:', sourceFile?.fileName)
console.log('statements:', sourceFile?.statements.length)

for (const statement of sourceFile?.statements ?? []) {
  if (!isExpressionStatement(statement)) continue
  const call = statement.expression
  if (!isCallExpression(call) || !isIdentifier(call.expression)) continue
  console.log(call.expression.text, '→', call.arguments[0]?.getText(), call.arguments[1]?.getText())
}

api.close()
