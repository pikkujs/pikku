import { hasScopes } from '../../scopes.js'

/**
 * Which of the product's agents a persona can actually talk to.
 *
 * An agent is not something a persona declares. It is something a persona
 * *reaches*, under exactly the rule an RPC is reached by: `CoreAIAgent.scopes`
 * is checked against the session, so a persona holding the scopes an agent
 * requires finds it in front of them, and one that does not, does not.
 *
 * That is the whole reason a persona has no `agent:` field. Naming one would
 * add no capability the roles do not already confer, and would narrow the
 * persona to a single brain when the interesting behaviour is the choice
 * between calling the API directly and handing the work to a specialist.
 */

/** The part of an agent's meta this needs. */
export interface AgentReachability {
  name?: string
  description?: string
  scopes?: readonly string[]
  auth?: boolean
}

/** One agent, as it is offered to a virtual user. */
export interface ReachableAgent {
  name: string
  description?: string
}

/**
 * The agents to offer, keyed by the name they are declared under.
 *
 * Like {@link reachableCatalogue}, this narrows *what is offered* and never
 * what is enforced: the server decides who may talk to what, and an agent
 * answering a persona this filter would have withheld is a finding rather than
 * a bug here.
 *
 * An agent declaring no scopes is offered to everybody, on the same terms as a
 * function that gates itself with none — undeclared is not the same as denied,
 * and inventing a denial here would hide the endpoints that really are open.
 */
export const reachableAgents = (
  agents: Readonly<Record<string, AgentReachability>>,
  scopes?: readonly string[]
): ReachableAgent[] =>
  Object.entries(agents)
    .filter(([, agent]) => {
      if (!scopes || !agent.scopes?.length) {
        return true
      }
      return hasScopes(agent.scopes, scopes)
    })
    .map(([id, agent]) => ({
      name: agent.name ?? id,
      ...(agent.description ? { description: agent.description } : {}),
    }))
