#!/usr/bin/env node
// `pikku-inspect --stdin`, answered by the TypeScript engine. Point
// PIKKU_INSPECTOR_GO_BIN here to run the Go wrapper end to end without Go.
import { analyzeWithTypeScript } from './ts-reference.ts'

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(chunk)
const output = await analyzeWithTypeScript(
  JSON.parse(Buffer.concat(chunks).toString('utf8'))
)
process.stdout.write(JSON.stringify(output))
