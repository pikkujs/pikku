import type {
  PikkuScenarioStepWire,
  ScenarioEnvironment,
} from './scenario-step.types.js'

/**
 * The actor this step was called with, or a loud error naming the step.
 *
 * A step that talks to the target app needs an identity, but `actor` is
 * optional on the wire because a pure assertion step needs none. This is the
 * one place that narrowing happens, so every step file stops writing its own
 * `actorOf(...)` guard.
 */
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

/**
 * The environment this run targets, or a loud error naming the step. A run
 * started outside `pikku scenario run` only carries one when the server has
 * `API_URL` configured.
 */
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
