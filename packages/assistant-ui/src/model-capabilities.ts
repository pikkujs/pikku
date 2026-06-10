const MODEL_VISION_SUPPORT = new Set([
  'claude-sonnet-4-5',
  'claude-opus-4-1',
  'gpt-4o-mini',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-codex',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
])

export function modelSupportsVision(modelID: string): boolean {
  return MODEL_VISION_SUPPORT.has(modelID)
}
