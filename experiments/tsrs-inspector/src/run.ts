import { resolve } from 'node:path'
import { discoverFunctions } from './discover.ts'

const dir = resolve(process.argv[2] ?? '.')
const found = discoverFunctions(dir)
console.log(
  JSON.stringify({ ...found, functions: found.functions.length }, null, 2)
)
