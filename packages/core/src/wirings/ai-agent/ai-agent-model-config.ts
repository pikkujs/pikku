/**
 * Resolves the effective model/temperature/maxSteps for an agent at runtime.
 *
 * Models are declared per-agent using the provider-qualified `provider/model`
 * form (e.g. `openai/gpt-5-mini`); there is no config-level alias map. This
 * function remains the single merge point for request-time overrides (see
 * ai-agent-prepare's `input.model`), so callers stay decoupled from how the
 * effective config is assembled.
 */
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
