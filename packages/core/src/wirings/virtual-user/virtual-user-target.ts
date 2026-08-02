import type { ScenarioPersona } from '../../services/personas-service.js'
import type { VirtualUserTarget } from './virtual-user.types.js'

export interface PersonaTargetOptions {
  /** Model the persona uses for its side of a conversation with an agent. */
  model?: string
  /** Agents this user may talk to. Omit to leave `talkTo` unavailable. */
  agents?: readonly string[]
}

/**
 * Drive a virtual user through a signed-in persona.
 *
 * This is the only place the engine meets the network. A persona already signs
 * in as a real user over the app's own auth, keeps its cookies, re-logs-in when
 * a session expires mid-run and reports a status as data rather than throwing —
 * everything a user imitating a user needs, and none of it worth building twice.
 *
 * `invokeRaw` rather than `invoke` matters: to a virtual user a 403 is not an
 * error, it is the system saying no, which is information it should be allowed
 * to act on.
 */
export const personaVirtualUserTarget = (
  persona: ScenarioPersona,
  { model, agents }: PersonaTargetOptions = {}
): VirtualUserTarget => ({
  call: (rpcName, args) => persona.invokeRaw(rpcName, args),
  talkTo: agents?.length
    ? async (agent, task) => {
        if (!agents.includes(agent)) {
          return {
            passed: false,
            reasoning: `There is no assistant called '${agent}'.`,
            transcript: [],
          }
        }
        return persona.converse({
          agent,
          task,
          // A user asking for something judges the answer by whether they got
          // what they asked for. There is no separate criterion to hold it to.
          evaluate: `The assistant did what was asked: ${task}`,
          model,
        })
      }
    : undefined,
})
