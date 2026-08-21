/**
 * What ties this project to the gated runtime schemas.
 *
 * `pikku db generate` writes a runtime schema only when the project reaches a
 * service that owns it, so the tables the migration is asserted to carry have
 * to be asked for by something. Destructuring is that ask — nothing here needs
 * to run for the generator to see it.
 *
 * The services this leaves out are the other half of the assertion: the schemas
 * a project that never reaches them must not be made to carry.
 */
import { pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'

export const runtimeServices = pikkuSessionlessFunc<{}, string[]>({
  func: async ({ workflowService, agentStorage, scopeService }) =>
    [workflowService, agentStorage, scopeService]
      .filter(Boolean)
      .map(() => 'wired'),
})

wireHTTP({
  route: '/runtime-services',
  method: 'get',
  auth: false,
  func: runtimeServices,
})
