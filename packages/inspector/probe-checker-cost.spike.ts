/**
 * The inspector's walk calls the checker once per interesting node. On 6 that
 * is a function call; on 7 it is an RPC. This measures the difference on the
 * same files, and what the batched array overloads buy back.
 */
import ts from 'typescript'
import { API } from '@typescript/native/unstable/sync'
import type { Node } from '@typescript/native/unstable/ast'
import { isIdentifier } from '@typescript/native/unstable/ast/is'
import { join, resolve } from 'node:path'
import { readdirSync } from 'node:fs'

const root = resolve(process.argv[2] ?? '../core')
const config = join(root, 'tsconfig.json')

const sources = readdirSync(join(root, 'src'), { recursive: true })
  .filter((f): f is string => typeof f === 'string' && f.endsWith('.ts'))
  .filter((f) => !f.endsWith('.test.ts'))
  .slice(0, 40)
  .map((f) => join(root, 'src', f))

console.log(`${sources.length} files`)

// ---- TypeScript 6 -----------------------------------------------------------
const parsed = ts.parseJsonConfigFileContent(
  ts.readConfigFile(config, ts.sys.readFile).config,
  ts.sys,
  root
)
let started = performance.now()
const program = ts.createProgram(sources, {
  ...parsed.options,
  skipLibCheck: true,
})
const checker = program.getTypeChecker()
const sixProgram = performance.now() - started

const sixNodes: ts.Node[] = []
for (const file of sources) {
  const sf = program.getSourceFile(file)
  if (!sf) continue
  const walk = (node: ts.Node) => {
    if (ts.isIdentifier(node)) sixNodes.push(node)
    ts.forEachChild(node, walk)
  }
  ts.forEachChild(sf, walk)
}

started = performance.now()
let sixHits = 0
for (const node of sixNodes) {
  if (checker.getSymbolAtLocation(node)) sixHits++
}
const sixCalls = performance.now() - started
console.log(
  `ts6: program ${sixProgram.toFixed(0)}ms, ${sixNodes.length} identifiers, ${sixCalls.toFixed(0)}ms of getSymbolAtLocation (${sixHits} resolved)`
)

// ---- TypeScript 7 -----------------------------------------------------------
started = performance.now()
const api = new API({ cwd: root })
const project = api.updateSnapshot({ openProjects: [config] }).getProject(config)!
const sevenProgram = performance.now() - started

const sevenNodes: Node[] = []
started = performance.now()
for (const file of sources) {
  const sf = project.program.getSourceFile(file)
  if (!sf) continue
  const walk = (node: Node) => {
    if (isIdentifier(node)) sevenNodes.push(node)
    node.forEachChild(walk)
  }
  sf.forEachChild(walk)
}
const sevenWalk = performance.now() - started

started = performance.now()
let sevenHits = 0
for (const node of sevenNodes) {
  if (project.checker.getSymbolAtLocation(node)) sevenHits++
}
const sevenCalls = performance.now() - started

started = performance.now()
const batched = project.checker.getSymbolAtLocation(sevenNodes)
const sevenBatched = performance.now() - started

console.log(
  `ts7: project ${sevenProgram.toFixed(0)}ms, walk ${sevenWalk.toFixed(0)}ms, ${sevenNodes.length} identifiers`
)
console.log(
  `     one at a time: ${sevenCalls.toFixed(0)}ms (${sevenHits} resolved)`
)
console.log(
  `     one batch:     ${sevenBatched.toFixed(0)}ms (${batched.filter(Boolean).length} resolved)`
)

api.close()
