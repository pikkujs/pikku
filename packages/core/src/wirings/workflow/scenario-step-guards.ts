import type {
  PikkuScenarioStepWire,
  ScenarioEnvironment,
} from './scenario-step.types.js'

/**
 * The environment the current scenario run targets, or a throw explaining that
 * the run carries none. Use it in a step that needs the target's URLs.
 *
 * @example snippet: scenarioHttpStep
 */
export const requireScenarioEnv = (
  scenarioStep: PikkuScenarioStepWire | undefined
): ScenarioEnvironment => {
  const env = scenarioStep?.env
  if (!env) {
    throw new Error(
      `[scenario] step '${scenarioStep?.name ?? 'unknown'}' needs the target environment, but this run carries none. ` +
        `Run it through 'pikku scenario run <environment>' with environments.<environment> declared in pikku.config.json.`
    )
  }
  return env
}
