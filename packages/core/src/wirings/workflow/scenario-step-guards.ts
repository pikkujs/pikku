import type {
  PikkuScenarioStepWire,
  ScenarioEnvironment,
} from './scenario-step.types.js'

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
