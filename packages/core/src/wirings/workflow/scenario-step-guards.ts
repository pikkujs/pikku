import type {
  PikkuScenarioStepWire,
  ScenarioEnvironment,
} from './scenario-step.types.js'

export const requireActor = <TActor>(
  scenarioStep: PikkuScenarioStepWire<TActor> | undefined
): TActor => {
  const actor = scenarioStep?.actor
  if (!actor) {
    throw new Error(
      `[scenario] step '${scenarioStep?.name ?? 'unknown'}' was called without an actor. ` +
        `Pass { actor: actors.<name> } so it runs as that persona.`
    )
  }
  return actor
}

export const requireScenarioEnv = (
  scenarioStep: PikkuScenarioStepWire<unknown> | undefined
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
