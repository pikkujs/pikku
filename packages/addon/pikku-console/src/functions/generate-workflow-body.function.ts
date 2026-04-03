import { pikkuSessionlessFunc } from '#pikku'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { pikkuState } from '@pikku/core/internal'
import type { WiringService, FunctionMeta } from '../services/wiring.service.js'

async function loadSchemas(metaDir: string): Promise<Record<string, any>> {
  const schemasDir = join(metaDir, 'schemas/schemas')
  const cache: Record<string, any> = {}
  try {
    const files = await readdir(schemasDir)
    for (const file of files) {
      if (file.endsWith('.schema.json')) {
        const name = file.replace('.schema.json', '')
        cache[name] = JSON.parse(
          await readFile(join(schemasDir, file), 'utf-8')
        )
      }
    }
  } catch {}
  return cache
}

function buildFunctionContext(
  functions: FunctionMeta[],
  schemas: Record<string, any>
): string {
  const lines: string[] = ['## Available Functions\n']

  for (const fn of functions) {
    if ((fn as any).functionType !== 'user') continue
    if (fn.pikkuFuncId.startsWith('pikkuWorkflow')) continue
    if (fn.pikkuFuncId.startsWith('pikkuRemote')) continue
    if (fn.pikkuFuncId.startsWith('http:')) continue

    const inputSchema = fn.inputSchemaName ? schemas[fn.inputSchemaName] : null
    const outputSchema = fn.outputSchemaName
      ? schemas[fn.outputSchemaName]
      : null

    let entry = `### ${fn.pikkuFuncId}`
    if ((fn as any).description) entry += `\n${(fn as any).description}`
    if (inputSchema) entry += `\nInput: ${JSON.stringify(inputSchema, null, 2)}`
    if (outputSchema)
      entry += `\nOutput: ${JSON.stringify(outputSchema, null, 2)}`
    lines.push(entry + '\n')
  }

  return lines.join('\n')
}

const DSL_EXAMPLES = `## Workflow DSL Syntax

Use \`await workflow.do(stepName, functionName, inputObject)\` to call functions.
Store results in variables to reference outputs in later steps.
The function signature is: \`async ({}, data, { workflow }) => { ... }\`

### Example: Sequential
\`\`\`typescript
async ({}, data, { workflow }) => {
  const doubled = await workflow.do('Double value', 'doubleValue', {
    value: data.value,
  })
  const formatted = await workflow.do('Format message', 'formatMessage', {
    greeting: 'Hello',
    name: data.name,
  })
  return {
    result: doubled.result,
    message: formatted.message,
  }
}
\`\`\`

### Example: Branching
\`\`\`typescript
async ({}, data, { workflow }) => {
  if (data.score >= 70) {
    const msg = await workflow.do('Premium', 'formatMessage', {
      greeting: 'Congratulations',
      name: data.name,
    })
    return { path: 'premium', message: msg.message }
  }
  const msg = await workflow.do('Standard', 'formatMessage', {
    greeting: 'Thank you',
    name: data.name,
  })
  return { path: 'standard', message: msg.message }
}
\`\`\`

### Example: With retries
\`\`\`typescript
async ({}, data, { workflow }) => {
  const result = await workflow.do('Fetch data', 'fetchData', {
    id: data.id,
  }, { retries: 3, retryDelay: '2s' })
  return { data: result }
}
\`\`\`
`

function buildPrompt(functionContext: string, userPrompt: string): string {
  return `You are generating a Pikku workflow function body.

${functionContext}

${DSL_EXAMPLES}

## Rules
- Use ONLY functions listed above in workflow.do() calls
- For addon functions, use the full namespaced name (e.g. 'todos:listTodos', 'emails:sendEmail')
- The step name (first arg) should be a human-readable description
- The function name (second arg) must exactly match a function name from the list
- Pass input as an object matching the function's input schema
- Store return values in variables to use in later steps
- Return an object at the end

## Task
Generate ONLY the async function body for this workflow:

${userPrompt}

Respond with ONLY the code starting with \`async ({}, data, { workflow }) => {\`. No markdown fences. No explanation.`
}

function buildFixPrompt(code: string, errors: string): string {
  return `Fix the following TypeScript errors in this Pikku workflow function body.

## Current Code
\`\`\`typescript
${code}
\`\`\`

## TypeScript Errors
${errors}

Respond with ONLY the fixed code starting with \`async ({}, data, { workflow }) => {\`. No markdown fences. No explanation.`
}

function extractCode(text: string): string {
  let code = text.trim()
  const fenceMatch = code.match(/```(?:typescript|ts)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) {
    code = fenceMatch[1]!.trim()
  }
  if (!code.startsWith('async')) {
    const asyncMatch = code.match(/(async\s*\([^)]*\)\s*=>[\s\S]*)/)
    if (asyncMatch) {
      code = asyncMatch[1]!.trim()
    }
  }
  return code
}

function callClaude(prompt: string): string {
  return execFileSync('claude', ['-p', prompt, '--model', 'haiku'], {
    timeout: 60_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString()
}

function tryTsc(rootDir: string): string | null {
  try {
    execSync('npx tsc --noEmit', {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    })
    return null
  } catch (e: any) {
    return e.stderr?.toString() || e.stdout?.toString() || e.message
  }
}

export const generateWorkflowBody = pikkuSessionlessFunc<
  { sourceFile: string; exportedName: string; prompt: string },
  { success: boolean; message: string; attempts: number }
>({
  title: 'Generate Workflow Body',
  description:
    'Uses AI to generate a workflow function body from a natural language prompt.',
  expose: true,
  auth: false,
  func: async (
    { codeEditService, wiringService },
    { sourceFile, exportedName, prompt }
  ) => {
    if (!codeEditService) {
      throw new Error('Only available in local development mode')
    }

    const metaDir = pikkuState(null, 'package', 'metaDir') ?? ''
    if (!metaDir) {
      throw new Error('Only available in local development mode')
    }
    const rootDir = dirname(metaDir)

    const allFunctions = Object.values(await wiringService.readFunctionsMeta())
    const schemas = await loadSchemas(metaDir)
    const functionContext = buildFunctionContext(allFunctions, schemas)

    const maxAttempts = 3
    let lastCode = ''
    let lastError = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let text: string
      try {
        if (attempt === 1) {
          text = callClaude(buildPrompt(functionContext, prompt))
        } else {
          text = callClaude(buildFixPrompt(lastCode, lastError))
        }
      } catch (e: any) {
        throw new Error(`AI generation failed: ${e.message}`)
      }

      const code = extractCode(text)
      if (!code.startsWith('async')) {
        if (attempt === maxAttempts) {
          throw new Error('AI did not return valid workflow code after retries')
        }
        lastCode = code
        lastError = 'Code must start with async ({}, data, { workflow }) => {'
        continue
      }

      lastCode = code
      await codeEditService.updateFunctionBody(sourceFile, exportedName, code)

      execSync('npx pikku all', {
        cwd: rootDir,
        stdio: 'pipe',
        timeout: 60_000,
      })

      const tscErrors = tryTsc(rootDir)
      if (!tscErrors) {
        return {
          success: true,
          message: `Workflow generated successfully`,
          attempts: attempt,
        }
      }

      lastError = tscErrors
      if (attempt === maxAttempts) {
        return {
          success: true,
          message: `Workflow generated but has TypeScript errors (${attempt} attempts)`,
          attempts: attempt,
        }
      }
    }

    return {
      success: false,
      message: 'Failed to generate workflow',
      attempts: maxAttempts,
    }
  },
})
