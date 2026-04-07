import { execFileSync } from 'node:child_process'

export interface ClaudeResult {
  text: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export function callClaude(prompt: string): ClaudeResult {
  const raw = execFileSync(
    'claude',
    ['-p', prompt, '--model', 'haiku', '--output-format', 'json'],
    { timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] }
  ).toString()
  const json = JSON.parse(raw)
  return {
    text: json.result ?? '',
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    costUsd: json.total_cost_usd ?? 0,
  }
}

export function extractJson(text: string): Record<string, any> | null {
  let clean = text.trim()
  const fenceMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) clean = fenceMatch[1]!.trim()
  const jsonMatch = clean.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
}

export function extractJsonArray(text: string): string[] | null {
  let clean = text.trim()
  const fenceMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) clean = fenceMatch[1]!.trim()
  const match = clean.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}
