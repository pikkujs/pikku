import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  projectWiresAgents,
  projectWiresMcp,
  runRequiredDepsChecks,
} from './required-deps-checks.js'

const installed =
  (...names: string[]) =>
  (specifier: string) =>
    names.includes(specifier) ? `/node_modules/${specifier}` : undefined

test('nothing is required when neither MCP nor agents are wired', () => {
  assert.deepEqual(
    runRequiredDepsChecks({
      root: '/p',
      wiresMcp: false,
      wiresAgents: false,
      resolve: installed(),
    }),
    []
  )
})

test('MCP without @pikku/modelcontextprotocol is an error, with it it is clean', () => {
  const input = {
    root: '/p',
    wiresMcp: true,
    wiresAgents: false,
  }
  const missing = runRequiredDepsChecks({ ...input, resolve: installed() })
  assert.deepEqual(
    missing.map((f) => [f.id, f.severity]),
    [['mcp-deps-missing', 'error']]
  )
  assert.deepEqual(
    runRequiredDepsChecks({
      ...input,
      resolve: installed('@pikku/modelcontextprotocol'),
    }),
    []
  )
})

test('agents without @pikku/ai-vercel is an error, with it it is clean', () => {
  const input = {
    root: '/p',
    wiresMcp: false,
    wiresAgents: true,
  }
  const missing = runRequiredDepsChecks({ ...input, resolve: installed() })
  assert.deepEqual(
    missing.map((f) => f.id),
    ['agent-deps-missing']
  )
  assert.deepEqual(
    runRequiredDepsChecks({ ...input, resolve: installed('@pikku/ai-vercel') }),
    []
  )
})

test('wiring detection reads the generated meta and ignores empty ones', async () => {
  const root = mkdtempSync(join(tmpdir(), 'required-deps-'))
  mkdirSync(join(root, '.pikku', 'mcp'), { recursive: true })
  mkdirSync(join(root, '.pikku', 'agent'), { recursive: true })
  writeFileSync(
    join(root, '.pikku', 'mcp', 'pikku-mcp-wirings-meta.gen.json'),
    JSON.stringify({ resourcesMeta: {}, toolsMeta: {} })
  )
  writeFileSync(
    join(root, '.pikku', 'agent', 'pikku-agent-wirings-meta.gen.json'),
    JSON.stringify({ agentsMeta: { a: {} } })
  )
  assert.equal(await projectWiresMcp(root, '.pikku'), false)
  assert.equal(await projectWiresAgents(root, '.pikku'), true)
  writeFileSync(
    join(root, '.pikku', 'mcp', 'pikku-mcp-wirings-meta.gen.json'),
    JSON.stringify({ toolsMeta: { t: {} } })
  )
  assert.equal(await projectWiresMcp(root, '.pikku'), true)
  assert.equal(await projectWiresMcp(join(root, 'nope'), '.pikku'), false)
})
