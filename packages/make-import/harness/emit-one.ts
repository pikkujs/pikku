/** Emit one blueprint and print the generated files — eyeball the real output. */
import { readFileSync } from 'node:fs'
import { generateWorkflowFromN8n } from '../../n8n-import/src/codegen.js'
import { parseMake } from '../src/parse-make.js'

const file = process.argv[2]!
const parsed = parseMake(JSON.parse(readFileSync(file, 'utf8')), 'demo')

console.log(`workflow : ${parsed.name}`)
console.log(`modules  : ${parsed.nodes.map((n) => `${n.name}(${n.type})`).join(' -> ')}`)
console.log(`warnings : ${JSON.stringify(parsed.warnings.map((w) => w.kind))}\n`)

const res = generateWorkflowFromN8n(parsed, { rpcPrefix: 'make' })
for (const [path, content] of Object.entries(res.files)) {
  console.log(`\n${'='.repeat(70)}\n${path}\n${'='.repeat(70)}`)
  console.log(content)
}
