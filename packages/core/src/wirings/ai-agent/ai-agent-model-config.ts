// knowledge: decisions/internals/ai-agent-model-config-stays-a-single-resolution-seam.md
export function resolveModelConfig(
  _agentName: string,
  agent: { model: string; temperature?: number; maxSteps?: number }
): { model: string; temperature?: number; maxSteps?: number } {
  return {
    model: agent.model,
    temperature: agent.temperature,
    maxSteps: agent.maxSteps,
  }
}
